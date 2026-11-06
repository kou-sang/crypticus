// Cliente mínimo de la REST API de Firestore para Workers (firebase-admin no corre en workerd).
// Autenticación: JWT de la cuenta de servicio -> access token OAuth2 (cacheado ~55 min por isolate).
import { importPKCS8, SignJWT } from 'jose';
import { AppError } from './errors';
import { decodeFields, encodeFields, type Fields } from './firestoreCodec';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface RawDocument {
  name: string;
  fields?: Fields;
}

// ---------- Cliente ----------

export type Write =
  | { kind: 'update'; path: string; data: Record<string, unknown> } // merge de campos listados
  | { kind: 'set'; path: string; data: Record<string, unknown> } // crea o reemplaza el documento
  | { kind: 'increment'; path: string; increments: Record<string, number> }
  // Agrega/actualiza claves de un campo mapa sin tocar el resto; crea el documento si no existe.
  | { kind: 'mergeMap'; path: string; field: string; entries: Record<string, number> }
  // Asigna campos anidados por ruta con puntos ("a.b.c") sin tocar el resto del documento.
  | { kind: 'setFields'; path: string; fields: Record<string, unknown> };

let cachedToken: { value: string; expiresAt: number } | null = null;

export class FirestoreRest {
  private readonly account: ServiceAccount;
  private readonly root: string;

  constructor(rawServiceAccount: string) {
    if (!rawServiceAccount) throw new AppError(500, 'misconfigured', 'FIREBASE_SERVICE_ACCOUNT no configurado.');
    const trimmed = rawServiceAccount.trim();
    try {
      this.account = JSON.parse(trimmed.startsWith('{') ? trimmed : atob(trimmed)) as ServiceAccount;
    } catch {
      throw new AppError(500, 'misconfigured', 'FIREBASE_SERVICE_ACCOUNT no es JSON válido.');
    }
    this.root = `projects/${this.account.project_id}/databases/(default)/documents`;
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

    const key = await importPKCS8(this.account.private_key, 'RS256');
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.account.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!response.ok) throw new AppError(502, 'google_auth', `OAuth falló (${response.status}).`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    cachedToken = { value: body.access_token, expiresAt: now + body.expires_in * 1000 };
    return body.access_token;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (response.status === 404) throw new AppError(404, 'not_found', 'Documento no encontrado.');
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AppError(502, 'firestore', `Firestore ${response.status}: ${detail.slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }

  private url(suffix: string): string {
    return `https://firestore.googleapis.com/v1/${this.root}${suffix}`;
  }

  private name(path: string): string {
    return `${this.root}/${path}`;
  }

  async getDoc<T>(path: string): Promise<(T & { id: string }) | null> {
    try {
      const doc = await this.request<RawDocument>(this.url(`/${path}`));
      return { id: doc.name.split('/').pop() ?? '', ...(decodeFields(doc.fields ?? {}) as T) };
    } catch (error) {
      if (error instanceof AppError && error.code === 'not_found') return null;
      throw error;
    }
  }

  async listDocs<T>(collectionPath: string): Promise<Array<T & { id: string }>> {
    const out: Array<T & { id: string }> = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ pageSize: '300', ...(pageToken ? { pageToken } : {}) });
      const page = await this.request<{ documents?: RawDocument[]; nextPageToken?: string }>(
        this.url(`/${collectionPath}?${query}`),
      );
      for (const doc of page.documents ?? []) {
        out.push({ id: doc.name.split('/').pop() ?? '', ...(decodeFields(doc.fields ?? {}) as T) });
      }
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  async batchGet<T>(paths: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    if (paths.length === 0) return result;
    const rows = await this.request<Array<{ found?: RawDocument }>>(this.url(':batchGet'), {
      method: 'POST',
      body: JSON.stringify({ documents: paths.map((p) => this.name(p)) }),
    });
    for (const row of rows) {
      if (row.found) result.set(row.found.name.split('/').pop() ?? '', decodeFields(row.found.fields ?? {}) as T);
    }
    return result;
  }

  /** Commit atómico (máx. 500 escrituras). */
  async commit(writes: Write[]): Promise<void> {
    if (writes.length === 0) return;
    if (writes.length > 500) throw new AppError(500, 'too_many_writes', 'Más de 500 escrituras en un commit.');
    const body = writes.map((write) => {
      if (write.kind === 'set') {
        return { update: { name: this.name(write.path), fields: encodeFields(write.data) } };
      }
      if (write.kind === 'setFields') {
        const nested: Record<string, unknown> = {};
        for (const [dotted, value] of Object.entries(write.fields)) {
          const parts = dotted.split('.');
          let node = nested;
          parts.slice(0, -1).forEach((part) => {
            node[part] = (node[part] as Record<string, unknown> | undefined) ?? {};
            node = node[part] as Record<string, unknown>;
          });
          node[parts[parts.length - 1]!] = value;
        }
        return {
          update: { name: this.name(write.path), fields: encodeFields(nested) },
          updateMask: { fieldPaths: Object.keys(write.fields) },
          currentDocument: { exists: true },
        };
      }
      if (write.kind === 'mergeMap') {
        const keys = Object.keys(write.entries);
        return {
          update: { name: this.name(write.path), fields: encodeFields({ [write.field]: write.entries }) },
          updateMask: { fieldPaths: keys.map((key) => `${write.field}.\`${key.replace(/[`\\]/g, '')}\``) },
        };
      }
      if (write.kind === 'update') {
        return {
          update: { name: this.name(write.path), fields: encodeFields(write.data) },
          updateMask: { fieldPaths: Object.keys(write.data) },
          currentDocument: { exists: true },
        };
      }
      return {
        transform: {
          document: this.name(write.path),
          fieldTransforms: Object.entries(write.increments).map(([fieldPath, amount]) => ({
            fieldPath,
            increment: { integerValue: String(Math.trunc(amount)) },
          })),
        },
        currentDocument: { exists: true },
      };
    });
    await this.request(this.url(':commit'), { method: 'POST', body: JSON.stringify({ writes: body }) });
  }
}
