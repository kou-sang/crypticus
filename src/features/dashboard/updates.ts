// Novedades que se muestran en Inicio. Solo cambios importantes para quien juega: nada de bug fixes,
// rendimiento ni ajustes menores (eso va en CHANGELOG.md). Al publicar una versión con algo destacado,
// agregar una entrada AL PRINCIPIO; Inicio muestra las primeras `UPDATES_SHOWN`.

export interface UpdateEntry {
  version: string; // SemVer, igual que `package.json`.
  date: string; // ISO (AAAA-MM-DD).
  title: string;
  items: string[];
}

export const UPDATES_SHOWN = 6;

export const UPDATES: readonly UpdateEntry[] = [
  {
    version: '1.2.0',
    date: '2026-11-07',
    title: 'Perfil por modo y Royale por tiempo',
    items: [
      'Elige el modo a la izquierda del perfil, como en Lichess.',
      'Royale tiene un Elo por tiempo: Hyperbullet, Bullet y Rapid, también en el Ranking.',
      'La evolución del Elo se ve por día.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-07',
    title: 'Tema Cripta',
    items: ['Antorchas con viento, muro con paralaje y pantallas que se desenrollan como pergaminos.'],
  },
  {
    version: '1.0.0',
    date: '2026-11-07',
    title: 'Temas, sonidos y salas con código',
    items: [
      'Temas Normal, Cripta y Cyber, cada uno con colores, animaciones y sonidos propios.',
      'Salas con código de 4 letras y enlace corto /s/CÓDIGO.',
      'Nunca salen dos cripticos seguidos del mismo tipo.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-11-07',
    title: 'Elo por modo',
    items: ['Race, Royale y Duel tienen su propio Elo.', 'El anfitrión puede editar los parámetros de la sala.'],
  },
  {
    version: '0.11.0',
    date: '2026-11-07',
    title: 'Combo, remontada y saltos en Royale',
    items: [
      'Duel: los aciertos seguidos golpean cada vez más fuerte.',
      'Remontada proporcional a la distancia con el líder.',
      'Royale: hasta 2 saltos por partida, a cambio de tiempo.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-11-07',
    title: 'Duel 2 vs 2',
    items: ['Equipos de dos con vida compartida: cualquiera del equipo puede responder.'],
  },
  {
    version: '0.9.0',
    date: '2026-11-06',
    title: 'Desempate y revancha',
    items: [
      'Muerte súbita con cripticos de 2 o 3 palabras si hay empate en la cima.',
      'Pide revancha con las mismas reglas: los rivales aceptan y vuelven a la sala.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-11-06',
    title: '1130 cripticos',
    items: ['500 cripticos nuevos, cada uno con su explicación y dos pistas.'],
  },
];
