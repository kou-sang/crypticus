# Modo COOP

Especificación: manual «Crypticus: modo COOP» (v2) y las respuestas del 10/11/2026. Este documento registra cómo se implementó y qué falta confirmar.

## Entrega

| PR | Contenido | Estado |
| --- | --- | --- |
| [#28](https://github.com/kou-sang/crypticus/pull/28) | Motor puro (`shared/coop`), catálogos, simulador y tests | ✅ En `main` |
| [#29](https://github.com/kou-sang/crypticus/pull/29) | Durable Object, sala (nivel, personajes), explicación previa, selección de cripticos | ✅ En `main` |
| [#30](https://github.com/kou-sang/crypticus/pull/30) | Pantalla de partida y tienda (bocetos), animaciones y sonidos por tema; COOP habilitado | ✅ En `main` |
| [#31](https://github.com/kou-sang/crypticus/pull/31) | Resultados, estadísticas por jugador y por jefe, soluciones, Elo COOP en Perfil y Ranking | ✅ En `main` |
| [#33](https://github.com/kou-sang/crypticus/pull/33) | Selección de personajes al iniciar y carga estilo LoL | ✅ En `main` |
| v1.4.0 | Pantalla en portal (arreglo de la partida vacía), pantalla completa automática, tarjetas sin figuras, rendición por votación | Este PR |

Falta:

- **Balance:** con los números actuales los bots no ganan (ver «Balance»). Ajustar `balance.ts`.
- **Nivel NT:** sus jefes y personajes (por ahora se muestra «Pronto»).

## Archivos

| Archivo | Qué tiene |
| --- | --- |
| `shared/coop/balance.ts` | Todos los números generales (tiempos, vida, daño, oro, tienda). |
| `shared/coop/catalog/*.ts` | Jefes, personajes y objetos: textos para la UI y parámetros de cada habilidad. |
| `shared/coop/schedule.ts` | Tipo de ronda (2N, D, 2N, D…), duración y dificultad de los cripticos. |
| `shared/coop/stats.ts` | Estadísticas derivadas: vida máxima, ataque, armadura, evasión. |
| `shared/coop/engine.ts` | Reductor `reduceCoop(estado, acción, ahora)` → estado nuevo + eventos. |
| `shared/coop/events.ts` | Eventos que la UI anima (daño, curación, muerte, tienda…). |
| `shared/coop/rng.ts` | Azar determinista: hash de (semilla, contexto). |
| `scripts/simulate-coop.ts` | Partidas completas con bots para medir el balance. |

## Diseño

- **Determinista:** el estado guarda una semilla. Cada tirada (evasión, crítico, SERPENTIS, tienda) es un hash de la semilla y su contexto (ronda, jugador, golpe), así que el mismo evento da el mismo resultado sin importar el orden de las demás tiradas.
- **Sin tareas redundantes en el servidor:** los efectos cada 5 s (veneno, curación de GOLIATH) y los vencimientos se calculan al avanzar el reloj. El servidor solo programa una alarma en `nextDeadline(estado)`.
- **Reloj de partida:** se detiene en la presentación de cada jefe (5 s). Corre durante las rondas, la tienda y las votaciones.
- **Carga previa:** el motor decide la dificultad de cada criptico por (semilla, ronda, jugador, casilla). El PR 2 puede elegir todos los cripticos de la partida al crearla, sin repetir, y mandarlos al abrir cada ronda.

## Interpretaciones (confirmar si alguna no es así)

1. Los golpes y el oro se aplican **al terminar la ronda**, en orden de asiento. El sobrante de daño sobre un jefe muerto se pierde.
2. Orden al terminar la ronda: ataques de los jugadores → efectos de PHARAONIS → quemaduras previas de LEVIATHAN → golpes del jefe → oro → inhibición de JEZABEL. Las quemaduras nuevas arden desde la ronda siguiente.
3. Los muertos no retienen la ronda: termina cuando todos los vivos no inhibidos resolvieron. Su curación de 20 se aplica al resolver.
4. Ronda difícil: el 60 % de los cripticos son difíciles y el 40 % muy difíciles de 2 palabras (el manual no da el reparto).
5. Las armas especiales (Espada de Goliat, Arco de Jonatán, Anillo del Faraón) también cambian el tipo de daño. La Vara de Moisés no es un arma.
6. La armadura de los jugadores reduce cualquier daño del jefe. El veneno, las quemaduras, la manzana, el 5 % de PHARAONIS y los 100 de la oferta secreta son daño directo, sin armadura.
7. El Manto de Elías evita el golpe por completo (0 de daño).
8. «Todos los aliados» (NATHAN, ELISEUS) incluye al propio jugador. «A un aliado» (TUBALCAIN, GEDEON, NAAMAN) es otro jugador.
9. NATHAN cuenta las rondas normales que gana él. TUBALCAIN, GEDEON, ELISEUS y SAMSON cuentan las difíciles superadas por el equipo.
10. SAMSON: la vida actual sube junto con la máxima al ganar una ronda.
11. HAMAN: el recargo se aplica a todo lo que cuesta oro (también a las recargas). No baja aunque HAMAN muera.
12. Cruz de Jesús: aparece como máximo una vez por partida.
13. Tienda: las ofertas de cada jugador no se repiten entre sí. Quien ya tiene un objeto «uno por jugador» no lo ve. Los objetos únicos de la party no aparecen si alguien ya los tiene.
14. DEBBORA: su activa revela una pista del criptico actual sin gastar su contador.
15. Las habilidades activas se usan en ronda, tienda o votación (una vez por ronda). No se usan durante la presentación de un jefe.
16. Flujo al iniciar: selección de personajes (60 s; al vencer, quien no eligió recibe uno libre al azar) → carga con explicación salteable (90 s o todos listos) → presentación del primer jefe. Quien sale antes de empezar queda fuera desde el primer instante.
17. Rendición: «Rendirse» abre una votación de 30 s de partida. Votan vivos y caídos (no los que salieron). Un «no» solo retira ese voto; pasa con el sí de todos y termina en derrota (cuenta para el Elo como cualquier derrota).
18. Cripticos: la regla de no repetir es por jugador. Cada uno tiene su lista por dificultad, ordenada por su propio historial (`userSeen`); en una ronda se evita repetir entre aliados si hay otro disponible. Al terminar, cada uno ve solo los que le aparecieron en pantalla, y solo esos se marcan como vistos.
19. Dificultad AT1/AT2/AT3: multiplica la vida y el daño base de los jefes por 2/3, 1 y 4/3. Como REX ASSUERUS nace con la vida actual de HAMAN, también escala. No cambian el tiempo, los cripticos, la tienda ni las habilidades. Rating del nivel para el Elo: 1350, 1500 y 1650.

## Balance (simulador)

Con los bots «normal» (40 partidas por tamaño), hoy las victorias son 0 % en las tres dificultades. Jefes caídos en promedio con 8 jugadores: AT1 1,15, AT2 0,82 y AT3 0,65. La dificultad mueve la curva, pero no resuelve el problema de fondo (rondas difíciles y daño de los jugadores).

```
npx tsx scripts/simulate-coop.ts --games 200 --party 4,6,8 --skill normal
```

Con los números del manual v2, los bots no ganan nunca. Bot «normal»: resuelve un fácil en ~15 s (95 %), un medio en ~25 s (85 %) y un difícil en ~38 s (65 %).

| Jugadores | Victorias | Jefes caídos | Rondas para el 1.er jefe | Tiendas por partida |
| --- | --- | --- | --- | --- |
| 4 | 0 % | 0,5 | 10 | 0,2 |
| 6 | 0 % | 0,7 | 8 | 0,1 |
| 8 | 0 % | 0,9 | 5,5 | 0,0 |

Causas medidas (30 partidas de 4 jugadores):

- **La ronda difícil casi nunca se supera** (8 de 119): hay que resolver un difícil o muy difícil en 30 s (21 s contra el jefe Expert), y tienen que lograrlo **todos**. Cada fallo golpea a toda la party: es la mayor fuente de muertes. Además, casi nunca se abre la tienda.
- **El daño de los jugadores es bajo** frente a la vida de los jefes: 30 por jugador por ronda ganada, contra 630 del jefe Easy con 4 jugadores. Hacen falta ~7 rondas perfectas solo para el primero.

El modelo de los bots es una estimación: los tiempos reales de resolución deciden. Ajustes a evaluar en `balance.ts`: ronda difícil de 60 s, ataque base 45–60 o vida de los jefes −30 %, y daño base de los jefes 30 (+10 por categoría).
