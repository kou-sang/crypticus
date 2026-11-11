// Historial de versiones para jugadores, en lenguaje común (el técnico va en CHANGELOG.md).
// Al publicar una versión, agregar una entrada AL PRINCIPIO con la misma versión de `package.json`:
// - `highlight: true` solo si trae algo importante para quien juega; Inicio muestra las últimas HIGHLIGHTS_SHOWN.
// - `news`: lo nuevo o lo que cambia. `fixes`: arreglos, sin jerga (nada de rendimiento interno ni refactors).

export interface Release {
  version: string; // SemVer, igual que `package.json`.
  date: string; // ISO (AAAA-MM-DD).
  title: string;
  highlight: boolean;
  news: string[];
  fixes?: string[];
}

export const HIGHLIGHTS_SHOWN = 3;

export const RELEASES: readonly Release[] = [
  {
    version: '1.9.0',
    date: '2026-11-11',
    title: 'Cripticos nuevos, pistas a elección y dificultad progresiva',
    highlight: true,
    news: [
      'Más de 2000 cripticos: casi 1000 nuevos y los anteriores revisados uno por uno (los de «iniciales de…» se reescribieron).',
      'Nueva dificultad «muy difícil» y nuevo tipo «charada».',
      'Pistas a elección: definición, indicador, relleno o una letra al azar. Lo que reveles se resalta en el enunciado.',
      'La dificultad sube de a poco en cada modo: Royale, Race según la meta, Duel según la vida y COOP según la ronda.',
      'COOP: las pistas son de un tipo (definición, indicador, relleno o letra); la de la tienda sale al azar.',
      'Ya no hay desempate: si terminan iguales en la cima, es empate.',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-11-10',
    title: 'Revancha en la misma sala',
    highlight: false,
    news: [],
    fixes: ['Revancha: todos vuelven a la misma sala aunque la pidan a la vez, con el mismo código y el mismo chat.'],
  },
  {
    version: '1.8.0',
    date: '2026-11-10',
    title: 'Arreglos de Royale, chat y votación de dificultad',
    highlight: false,
    news: [
      'Race Hardcore: la dificultad del próximo criptico se vota cuando todos terminan, durante 7 s. Gana la mayoría; si empatan, se sortea entre las más votadas.',
      'Los avisos de la partida (rondas nuevas, daño, aciertos…) ahora aparecen dentro del chat de la sala.',
    ],
    fixes: [
      'La pantalla ya no baja sola al resolver un criptico en Royale.',
      'El chat de la sala tiene un alto fijo y barra para desplazarse.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-11-10',
    title: 'COOP: chat, estados y oro por criptico',
    highlight: true,
    news: [
      'En las rondas normales de COOP, cada criptico que resuelves golpea al jefe al instante.',
      'En COOP, cada criptico que resuelves da 15 + el número de la ronda de oro, al instante.',
      'La ronda difícil trae cripticos medios o difíciles; desde la ronda 11, difíciles o muy difíciles.',
      'Chat de la sala al costado durante la partida, con aviso de mensajes nuevos.',
      'Cada jugador muestra sus efectos de estado (quemado, envenenado, soldado, buffs…) con el tiempo que les queda.',
      'El registro cuenta cada golpe y la causa de cada daño.',
      'Toca al jefe para ver sus habilidades y efectos. PHARAONIS avisa en grande cada plaga que activa y muestra cuál viene.',
    ],
    fixes: [
      'Curarse ya no hace temblar la tarjeta como si recibieras daño.',
      'Debbora ya puede usar su habilidad: empieza con 1 carga.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-11-10',
    title: 'COOP: golpes al instante',
    highlight: false,
    news: [
      'En las rondas normales de COOP golpeas al jefe apenas resuelves tus cripticos. Si cae, la ronda termina y nadie más recibe daño.',
      'El historial de COOP en el perfil muestra nivel, resultado, ronda, jefes derrotados y Elo.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-11-10',
    title: 'COOP: tres dificultades',
    highlight: true,
    news: [
      'Al crear una sala COOP eliges AT1, AT2 o AT3. AT2 es la de siempre.',
      'En AT1 los jefes tienen un tercio menos de vida y de daño; en AT3, un tercio más.',
      'Ganar en una dificultad más alta da más Elo.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-11-10',
    title: 'COOP: cripticos propios',
    highlight: false,
    news: ['En COOP cada uno recibe cripticos que nunca vio, aunque sus compañeros ya los hayan jugado.'],
    fixes: ['Al terminar una partida COOP ves solo tus cripticos, no los de tus aliados ni los que no llegaron a salir.'],
  },
  {
    version: '1.4.0',
    date: '2026-11-10',
    title: 'COOP: arreglos y rendición',
    highlight: false,
    news: [
      'COOP se pone en pantalla completa al empezar.',
      'Se puede votar rendirse: hace falta que todos digan que sí.',
      'Jefe y jugadores se muestran como tarjetas claras, sin figuras, con su vida y estados como «Quemado».',
    ],
    fixes: ['En COOP, algunos jugadores no veían la partida al empezar.', 'En la pantalla de carga, el texto ya no tapa los botones.'],
  },
  {
    version: '1.3.0',
    date: '2026-11-10',
    title: 'Modo COOP',
    highlight: true,
    news: [
      'De 4 a 8 jugadores contra 4 jefes bíblicos en 22 minutos (nivel AT). Solo en PC o laptop.',
      'Al iniciar, cada uno elige su personaje en una ventana de selección (no se repiten), y luego carga la partida.',
      'Rondas normales para atacar y ganar oro, rondas difíciles en grupo que abren la tienda.',
      'Cada jefe tiene sus habilidades: ofertas de PHARAONIS, armadura de GOLIATH, letras desfasadas de SERPENTIS y más.',
      'COOP tiene su propio Elo, en el Perfil y en el Ranking, y resultados con las estadísticas de cada jugador y de cada jefe.',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-11-08',
    title: 'Revancha a tu ritmo',
    highlight: false,
    news: ['Al aceptar una revancha vuelves a la sala, y quien la pidió la inicia cuando estén todos.'],
    fixes: [
      'En Jugar → De amigos ya no aparecen salas viejas o abandonadas que luego desaparecían.',
      'El aviso de «versión nueva» solo aparece cuando de verdad hay una, e indica cuál.',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-11-08',
    title: 'Alta sin trabas',
    highlight: false,
    news: [],
    fixes: [
      'Algunas personas (Brave y Safari en iPhone, Firefox en PC) volvían a «Firma tu primera partida» después de pulsar Continuar. Ya no pasa, y si el servidor no responde se avisa con un botón para reintentar.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-07',
    title: 'Perfil por modo y Royale por tiempo',
    highlight: true,
    news: [
      'Elige el modo a la izquierda del perfil, como en Lichess.',
      'Royale tiene un Elo para cada tiempo: Hyperbullet, Bullet y Rapid, también en el Ranking.',
      'La evolución del Elo se ve día a día.',
      'Inicio muestra las novedades más importantes.',
      'El Ranking es más compacto y se lee de un vistazo.',
      'En el resumen de cada partida ves quién resolvió cada criptico (✓) y quién no (✗).',
    ],
    fixes: ['Botones y textos que casi no se veían en los temas Cripta y Cyber.'],
  },
  {
    version: '1.1.0',
    date: '2026-11-07',
    title: 'Tema Cripta',
    highlight: true,
    news: [
      'Antorchas con llamas vivas que el viento dobla de vez en cuando.',
      'El muro de piedra se mueve un poco al cambiar de sección y al mover el puntero.',
      'Las pantallas y ventanas se desenrollan como pergaminos.',
      'Los relojes suenan y laten en los últimos segundos, y la cuenta 3-2-1 tiene sonido propio.',
    ],
    fixes: [
      'En el celular, el teclado ya no se cierra al pasar de un criptico a otro.',
      'En el celular, la barra inferior se oculta durante la partida para no salir por accidente.',
      'En iPhone, el alta del perfil podía quedarse colgada.',
      'Ajustes visuales en Cyber (letras más legibles, con tildes y ñ) y en Cripta (opciones con borde propio, sin parpadeos al pasar el mouse).',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-07',
    title: 'Temas, sonidos y salas con código',
    highlight: true,
    news: [
      'Temas Normal, Cripta y Cyber, cada uno con sus colores, animaciones y sonidos.',
      'Cada sala tiene un código de 4 letras y un enlace corto para compartirla.',
      'El anfitrión puede cambiar las reglas desde la sala mientras espera.',
      'Nunca salen dos cripticos seguidos del mismo tipo.',
      'Ajustes más ordenados, con interruptores para cada sonido.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-11-07',
    title: 'Elo por modo',
    highlight: false,
    news: ['Race, Royale y Duel tienen cada uno su propio Elo.', 'El anfitrión puede editar los parámetros de la sala.'],
  },
  {
    version: '0.11.0',
    date: '2026-11-07',
    title: 'Combo, remontada y saltos en Royale',
    highlight: false,
    news: [
      'Duel: los aciertos seguidos golpean cada vez más fuerte.',
      'Quien va atrás recibe un empujón proporcional a la distancia con el líder.',
      'Royale: hasta 2 saltos por partida, a cambio de tiempo.',
      'Perfil con un panel para cada modo.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-11-07',
    title: 'Duel 2 vs 2',
    highlight: false,
    news: ['Equipos de dos con vida compartida: cualquiera del equipo puede responder.', 'Duel necesita al menos un rival para empezar.'],
  },
  {
    version: '0.9.0',
    date: '2026-11-06',
    title: 'Desempate y revancha',
    highlight: false,
    news: [
      'Si hay empate en la cima, muerte súbita con cripticos de 2 o 3 palabras.',
      'Pide revancha con las mismas reglas.',
      'Race: eliges si hay pistas (1 o 2 por partida).',
    ],
    fixes: ['Aceptar una invitación te lleva directo a la sala.'],
  },
  {
    version: '0.8.0',
    date: '2026-11-06',
    title: '1130 cripticos',
    highlight: false,
    news: ['500 cripticos nuevos, cada uno con su explicación y dos pistas.', 'Gráfico con la evolución de tu Elo.'],
  },
  {
    version: '0.7.0',
    date: '2026-11-06',
    title: 'Race más justo',
    highlight: false,
    news: [
      'Race va en orden: no se puede saltear, pero puedes rendirte unas pocas veces.',
      'Una pista de carrera muestra el avance de cada rival.',
      'Espera de unos segundos entre intentos, para que no valga probar al azar.',
      'Nadie puede ver el siguiente criptico antes de tiempo.',
      'Portada nueva que explica cómo se lee un criptico.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-11-06',
    title: 'Race, Royale y Duel',
    highlight: false,
    news: [
      'Tres modos: Race (llegar primero a la meta), Royale (cada acierto suma tiempo a tu reloj; gana el último en pie) y Duel (barras de vida).',
      'Ranking separado por modo.',
      'Amigos con lista y desafíos, al estilo Lichess.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-06',
    title: 'Más rápido y sin repetir',
    highlight: false,
    news: [
      'Las respuestas llegan antes y, si dos aciertan casi a la vez, gana quien respondió primero de verdad.',
      'No vuelven a salir cripticos que ya jugaste mientras queden otros.',
      'Se puede votar para terminar la partida.',
      'Menú con Inicio, Jugar, Amigos y Ranking.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-11-06',
    title: 'Escribir en las casillas',
    highlight: false,
    news: [
      'Se escribe directo en las casillas de la respuesta.',
      'Cada criptico muestra su explicación al resolverlo y al final de la partida.',
      'Reloj y puntaje fijos arriba mientras juegas.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-06',
    title: 'Interfaz más simple',
    highlight: false,
    news: ['Ranking más legible y salas más fluidas.'],
  },
  {
    version: '0.2.0',
    date: '2026-11-05',
    title: 'Rondas, votos y efectos',
    highlight: false,
    news: [
      'Rondas con un criptico para todos y votación de dificultad del siguiente.',
      'Tiempo extra y pasar ronda por votación.',
      'Animaciones y sonidos al acertar.',
      'Historial de partidas y página de ajustes.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-04',
    title: 'Primera versión',
    highlight: false,
    news: [
      'Registro con correo o Google y @usuario propio.',
      'Competencias en vivo con pistas, marcador y resultados.',
      'Amigos, chat y ranking con Elo.',
    ],
  },
];
