# Aviso de Privacidad, Términos y Condiciones

**Última actualización: 16 de agosto de 2026.**

> **Este documento es un borrador de investigación técnico-regulatoria para apoyar decisiones de arquitectura y producto. No es asesoría legal formal ni ha sido validado por un abogado mexicano con cédula profesional vigente. No debe tratarse como definitivo, ni publicarse como la versión final del sitio, hasta que un abogado mexicano lo revise y lo apruebe.** La sección 4 de este documento lista explícitamente las preguntas que quedaron sin resolver y que requieren ese criterio profesional.

---

## 0. Qué es Vouch402, en términos simples

Antes de las secciones formales, una descripción honesta de lo que el producto hace, porque de eso depende todo lo demás en este documento:

Vouch402 es una API que vende, por evento, un puntaje de riesgo (0 a 100) sobre una dirección de la red Base (una blockchain pública compatible con Ethereum), calculado a partir de señales públicas en cadena (antigüedad de la wallet, número de transacciones, diversidad de contratos con los que ha interactuado, y una lista propia de direcciones marcadas). El pago se hace en USDC directamente en la red Base. Cada respuesta se acompaña de una atestación pública e inmutable en EAS (Ethereum Attestation Service, también sobre Base) que prueba lo que el servicio realmente entregó.

Vouch402 **no es una wallet, no es un exchange, no es una plataforma de custodia, y no gestiona fondos de terceros**. Quien paga transfiere USDC directamente, con su propia wallet, a la dirección de cobro de Vouch402; el servidor de Vouch402 nunca firma ni envía esa transacción, solo la verifica leyendo la cadena pública después de que ya ocurrió. Esta afirmación está verificada contra el código fuente real del proyecto (no es una descripción de marketing), y se detalla en la sección 1.3.

---

## 1. Aviso de Privacidad

### 1.1 Identidad del responsable (dato pendiente, ver sección 4)

La Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) exige que el Aviso de Privacidad identifique al responsable del tratamiento de datos y su domicilio (Art. 15 y 16 de la LFPDPPP, texto vigente citado en 1.7 abajo). **Verificado contra el repositorio del proyecto: no existe actualmente una razón social, RFC, ni domicilio fiscal registrados en ningún archivo del proyecto** (el `LICENSE` solo dice "Copyright (c) 2026 Vouch402", sin persona física o moral identificada). Este campo queda como **PENDIENTE**: no se puede publicar un Aviso de Privacidad legalmente completo sin esta información. Ver sección 4, pregunta 3.

Hasta que exista una entidad identificada, el único canal de contacto real del proyecto es su repositorio público en GitHub: `https://github.com/Eras256/Vouchx402`.

### 1.2 Datos que se recaban (verificado contra el código, no una lista genérica)

Vouch402 **no tiene cuentas de usuario, no pide nombre, correo electrónico, teléfono, ni documentos de identidad, y no realiza ningún proceso de KYC** en ninguno de sus componentes (API, sitio web, CLI, SDK, servidor MCP). Verificado revisando el esquema completo de la base de datos (`src/lib/db.ts`) y cada endpoint del servidor (`src/server/app.ts`).

Lo que sí se procesa:

| Dato | Dónde se guarda | Quién lo puede ver |
|---|---|---|
| Dirección de wallet que paga (`payer`) | Base de datos local (SQLite, propia del servidor, no un servicio externo como Supabase) y, siempre, como atestación pública e inmutable en EAS sobre Base | Público, permanente, en la blockchain |
| Dirección de wallet consultada (el "address" que se está calificando) | Igual que arriba | Público, permanente, en la blockchain, vinculado al hash de la respuesta |
| Hash de la transacción de pago | Igual que arriba | Público, permanente (ya es un dato público de la blockchain de por sí) |
| Puntaje y señales de riesgo (`score`, `signals`) calculados | Solo el **hash** del contenido de la respuesta va en la atestación pública por defecto. El contenido completo (puntaje y señales en texto plano) solo se guarda y se expone públicamente vía `GET /v1/activity` si quien paga marca `makePublic: true`, o si es la wallet propia del equipo (pública por defecto, ver DECISION_LOG.md del proyecto) | Privado por defecto; público y permanente si se activa `makePublic` |
| Texto libre de una disputa (`details`, si se usa `POST /v1/disputes`) | Se escribe **directamente en una atestación en cadena, pública, inmutable, no revocable** | Público, permanente, para siempre, en la blockchain |
| Preferencia de tema (claro/oscuro) y de red (testnet/mainnet) en el sitio web | Únicamente en `localStorage` del navegador del visitante. **Nunca se transmite al servidor de Vouch402** | Solo el propio visitante, en su propio navegador |

**Aviso importante y poco común en un Aviso de Privacidad convencional:** cualquier dato que Vouch402 escribe en una atestación de EAS queda en la blockchain de Base de forma pública, permanente e inmutable por diseño del protocolo. Esto incluye, en particular, el campo de texto libre de una disputa. **Si usted incluye datos personales propios o de terceros en ese campo, esos datos quedarán públicos para siempre y no podrán borrarse ni corregirse**, ni por usted ni por Vouch402. Esta característica entra en tensión directa con los derechos de cancelación y rectificación descritos en 1.5, y se documenta como pregunta abierta en la sección 4.

**Sobre la dirección que se consulta (no necesariamente la de quien paga):** el servicio permite consultar el riesgo de la dirección de un tercero, sin el conocimiento ni el consentimiento de esa persona. Una dirección de blockchain no está, por sí sola, necesariamente vinculada a una persona física identificada o identificable; pero si lo está (por ejemplo, si esa dirección es públicamente atribuible a alguien), Vouch402 podría estar tratando datos personales de alguien que nunca interactuó con el servicio. Este punto se documenta como pregunta abierta en la sección 4.

### 1.3 Modelo de custodia (verificado contra el código de pago)

Verificado directamente en `src/server/payment.ts` y `src/server/x402.ts`:

1. Vouch402 emite una cotización (precio y dirección de cobro).
2. Quien paga envía, **con su propia wallet y sus propias llaves**, una transferencia estándar de USDC en la red Base, sin intervención de Vouch402 en la construcción, firma o envío de esa transacción.
3. Quien paga le da a Vouch402 el hash de esa transacción ya confirmada.
4. El servidor de Vouch402 **lee** la blockchain pública (vía un nodo RPC de Base) para confirmar que la transferencia ocurrió, coincide con lo cotizado, y no se ha usado antes. Nunca firma, envía, ni tiene la capacidad técnica de mover esos fondos.

La única llave privada que el servidor de Vouch402 sí utiliza es una llave operativa propia (guardada como un keystore cifrado de Foundry, nunca en texto plano) que únicamente firma las transacciones de atestación en EAS (pagando el gas de esas transacciones con fondos propios de Vouch402). Esa llave no tiene ninguna relación con los fondos de los usuarios.

La dirección donde Vouch402 recibe el pago (`X402_PAY_TO_ADDRESS_MAINNET`) es, por diseño, una dirección distinta de la llave operativa del servidor (ver DECISION_LOG.md del proyecto, entrada "Split payTo (treasury) from the signer wallet"), y es simplemente la cuenta propia de Vouch402 recibiendo el pago por su propio servicio, igual que cualquier comercio que cobra en criptomonedas.

### 1.4 Finalidades del tratamiento

- Prestar el servicio pagado (calcular y entregar el puntaje de riesgo).
- Verificar que el pago efectivamente ocurrió en la blockchain antes de entregar el resultado.
- Emitir el registro público de cumplimiento (atestación EAS) que permite que cualquiera, incluido quien pagó, verifique de forma independiente qué se entregó.
- Calcular contadores públicos agregados (`GET /v1/metrics`): número de pagadores únicos, total de solicitudes, volumen total, número de atestaciones y disputas. Estos contadores son agregados, no individualizan a nadie más allá de lo que ya es público en la blockchain.

No hay finalidades secundarias de mercadotecnia, publicidad, ni perfilamiento comercial. No se venden datos a terceros con fines distintos a los aquí descritos.

### 1.5 Terceros que reciben datos como parte del funcionamiento del servicio

Verificado contra las dependencias reales del código (`src/lib/chain.ts`, `src/scoring/score.ts`):

- **Nodos RPC públicos de Base** (`mainnet.base.org` / `sepolia.base.org`, operados por Base/Coinbase): reciben la dirección consultada y el hash de transacción para leer la blockchain pública.
- **Blockscout** (`base.blockscout.com`, un explorador de bloques independiente): recibe la dirección que se está calificando, para obtener su historial de transacciones públicas.
- **Ethereum Attestation Service / la red Base**: reciben y almacenan permanentemente los datos descritos en 1.2 que se escriben en cada atestación.
- **Coinbase / Base Account SDK** (`@base-org/account`, usado en la demo "Try It" del sitio): gestiona la conexión de wallet y el pago directamente entre el navegador del visitante y la infraestructura de Coinbase. Vouch402 nunca ve ni maneja llaves privadas ni credenciales de la wallet del visitante en ese flujo.
- **Vercel** (hospedaje del sitio web) y **Fly.io** (hospedaje de la API): como cualquier proveedor de infraestructura, pueden registrar metadatos técnicos de conexión (por ejemplo, dirección IP) como parte de su operación estándar. **Esto no fue verificado directamente en el código de la aplicación** porque ocurre a nivel de infraestructura, no de código propio de Vouch402; se declara aquí de forma transparente en lugar de omitirlo.

Todos los datos anteriores relacionados con direcciones de blockchain y transacciones son, por naturaleza, datos que ya son públicos en la cadena; Vouch402 no convierte datos privados en públicos al consultarlos, salvo por la excepción del campo de disputas y el `makePublic` ya descritos en 1.2.

### 1.6 Cookies y tecnologías de rastreo

**Verificado directamente en el código fuente del sitio web (`web/`): Vouch402 no usa cookies.** No hay cookies de sesión, de analítica, ni de publicidad. No hay Google Analytics, Meta Pixel, ni ningún otro rastreador de terceros instalado (se revisaron todas las dependencias del `package.json` del sitio). Las únicas preferencias que se guardan (tema claro/oscuro, red testnet/mainnet) usan `localStorage` del navegador, un mecanismo que nunca se transmite al servidor y que el visitante puede borrar en cualquier momento desde la configuración de su propio navegador.

### 1.7 Derechos ARCO y autoridad garante

Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse (derechos ARCO) al tratamiento de sus datos personales, en los términos de la LFPDPPP (Art. 2, fracción VII; Capítulo del ejercicio de derechos ARCO, Arts. 27 en adelante del texto vigente).

**Importante, verificado contra el texto oficial vigente de la ley** (Ley Federal de Protección de Datos Personales en Posesión de los Particulares, publicada en el DOF el 20 de marzo de 2025, en vigor desde el 21 de marzo de 2025, última reforma DOF 14-11-2025; texto consultado en `https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf`): el Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales (INAI) fue extinguido (decreto constitucional DOF 20 de diciembre de 2024), y la propia LFPDPPP de 2025 define en su Artículo 2, fracción XV, que la autoridad ("Secretaría") es la **Secretaría Anticorrupción y Buen Gobierno**. **Cualquier mención al INAI en material previo de este proyecto está desactualizada y debe corregirse a esta autoridad.**

Dado que la sección 1.1 queda pendiente (no hay responsable identificado ni contacto formal), **el mecanismo real para ejercer estos derechos aún no está definido**. Ver sección 4.

### 1.8 Conservación de datos

- **En cadena (EAS/Base):** indefinida por diseño del protocolo; no existe mecanismo técnico para borrar una atestación ya emitida.
- **Fuera de cadena (base de datos local del servidor):** el código actual no implementa un período de retención ni un borrado automático. Esto es una decisión de producto pendiente, no un hecho verificado como "ya resuelto"; se documenta como pregunta abierta en la sección 4.

### 1.9 Cambios a este aviso

Cualquier cambio a este Aviso de Privacidad se publicará en esta misma página, actualizando la fecha de "Última actualización" en la parte superior.

---

## 2. Términos y Condiciones

### 2.1 Descripción del servicio

Vouch402 ofrece, mediante el protocolo abierto x402 sobre HTTP, un endpoint pagado por solicitud (`GET /v1/risk-score/:address`) que entrega un puntaje de riesgo (0 a 100) y las señales que lo componen, para una dirección de la red Base, a cambio de un pago en USDC verificado en cadena. El puntaje se calcula con una heurística **v0, explícitamente no exhaustiva** (antigüedad de la wallet, número de transacciones, diversidad de interacciones con contratos, y una lista propia de direcciones marcadas), documentada como tal en la especificación técnica del proyecto.

**Qué hace exactamente el endpoint, y qué no hace.** Esta descripción está verificada contra el código y las respuestas reales de la API vigentes a la fecha de este documento (auditoría registrada en `DECISION_LOG.md`, "Standing rule, the 'Buró de Crédito' line"), no es una descripción de intención de diseño:

- Es una consulta (`GET`), nunca una acción. Vouch402 no tiene, ni hoy ni como parte de este documento, ningún endpoint que ejecute, conecte, o intermedie una operación entre dos agentes. El único endpoint que recibe un `POST` (`/v1/disputes`) archiva un registro público de desacuerdo sobre una entrega pasada; no mueve fondos, no revierte nada, y no conecta a nadie con nadie.
- La respuesta entrega un número y señales nombradas (`score`, `walletAgeDays`, `txCount`, `uniqueContractInteractions`, `flagged`), nunca un veredicto. No existe, en ninguna versión actual de la API, un campo que diga "aprobado", "seguro para transactar", o una recomendación de proceder o no. La decisión sobre qué hacer con ese número le corresponde enteramente a quien hace la llamada; cualquier lógica de umbral ("si el puntaje es mayor a X, continuar") vive en el código de quien consulta, nunca en el servidor de Vouch402.
- La API nunca recibe, ni tiene forma de recibir, datos sobre la operación que quien consulta está por realizar con la dirección calificada (con quién, por cuánto, para qué). Lo único que llega a la API es la dirección que se califica y la dirección de quien paga por la consulta misma; nada más.
- Si Vouch402 dejara de estar disponible, ninguna transacción entre dos agentes que dependiera de esta consulta quedaría bloqueada por ese hecho: en el peor caso, quien consultaba pierde esa señal informativa adicional y decide con menos información, pero la operación en sí (el pago, el acuerdo, la transacción entre esos dos agentes) nunca depende técnicamente de que Vouch402 esté funcionando, porque Vouch402 nunca participa en construirla, firmarla, ni transmitirla.

Esta descripción se revisará cada vez que se agregue un endpoint o un campo nuevo a la API (ver la regla permanente en `DECISION_LOG.md`), para que esta sección nunca describa una versión pasada o aspiracional del servicio.

### 2.2 No custodia (ver detalle verificado en 1.3)

Vouch402 nunca tiene, custodia, ni transmite fondos de terceros. Vende un servicio de datos a cambio de una tarifa pagada directamente a su propia dirección. No es un intermediario entre los fondos de dos partes distintas, ni ofrece custodia, cambio, ni transferencia de activos virtuales por cuenta de sus clientes.

### 2.3 No es asesoría de inversión ni financiera

El puntaje de riesgo que entrega Vouch402 es una señal informativa derivada de datos públicos en cadena, calculada con una heurística v0 explícitamente incompleta. **No constituye, y no debe interpretarse como, asesoría de inversión, recomendación financiera, ni una determinación definitiva sobre la legitimidad, solvencia, o comportamiento de ninguna dirección o persona.** Cualquier decisión que un agente humano o autónomo tome con base en este puntaje es responsabilidad exclusiva de quien la toma.

### 2.4 Mecanismo de disputas (lo que sí hace y lo que no hace)

El endpoint `POST /v1/disputes` permite a quien pagó por una solicitud dejar un registro público, firmado, y vinculado en cadena, en desacuerdo con lo que recibió (por ejemplo: no entrega, respuesta mal formada, datos obsoletos). Es importante ser preciso: **presentar una disputa no genera automáticamente un reembolso.** Es un registro público de desacuerdo, no un mecanismo de devolución de fondos. Dado que los pagos se liquidan de forma irreversible en la blockchain, no existe hoy un mecanismo automático de reembolso; cualquier resolución fuera del registro público de la disputa dependería de un proceso manual no descrito en el código actual. Ver sección 4.

### 2.5 Riesgos que el usuario acepta

- Riesgo de red: los nodos RPC públicos de Base pueden fallar o responder con retraso (documentado en DECISION_LOG.md del proyecto como un problema real observado, no hipotético).
- Riesgo de terceros: el cálculo del puntaje depende de datos servidos por Blockscout, un servicio independiente que Vouch402 no opera.
- Riesgo de un producto en etapa temprana ("v0"): la heurística de riesgo es simple y explícitamente no exhaustiva.
- Riesgo de irreversibilidad: todo pago en blockchain es, por naturaleza, irreversible una vez confirmado.

### 2.6 Restricciones de uso y jurisdicciones

Vouch402 es una API pública, sin control de acceso, sin verificación de identidad ni de edad, y sin bloqueo geográfico. **Esto es una descripción de hecho, no una postura legal**: no se ha determinado si el servicio debería restringir su uso desde ciertas jurisdicciones. Ver sección 4.

### 2.7 Alcance territorial de este documento

Este documento fue redactado con enfoque en el marco legal de México, a solicitud expresa. **El sitio y la API, sin embargo, no están limitados a usuarios en México**: el idioma por defecto del sitio es inglés, y el tráfico esperado incluye agentes y desarrolladores de cualquier país. Este documento **no** cubre ni verifica el cumplimiento de regímenes como el RGPD/GDPR de la Unión Europea, leyes estatales de privacidad de Estados Unidos, ni ningún otro marco fuera de México. Eso queda fuera del alcance de esta redacción y debe abordarse por separado. Ver sección 4.

### 2.8 Limitación de responsabilidad

El servicio se ofrece "tal cual" ("as is"), sin garantías de disponibilidad continua, exactitud del puntaje, ni ausencia de errores. En la medida permitida por la ley aplicable, Vouch402 no será responsable por daños indirectos, incidentales, o consecuentes derivados del uso del servicio o de decisiones tomadas con base en su resultado.

### 2.9 Ley aplicable y resolución de disputas legales (fuera de la plataforma)

**No definido en este borrador.** Requiere una decisión explícita sobre qué ley aplica y ante qué foro (tribunales mexicanos, arbitraje, u otro mecanismo) se resolverían controversias que no puedan resolverse mediante el mecanismo de disputas en cadena descrito en 2.4. Ver sección 4.

### 2.10 Modificaciones a estos Términos

Cualquier cambio se publicará en esta misma página, actualizando la fecha de "Última actualización".

---

## 3. Avisos y Limitaciones de Responsabilidad (Disclaimers)

### 3.1 No es asesoría de inversión

Reiterado de 2.3: nada en este sitio, en la API, ni en el puntaje entregado constituye asesoría de inversión, legal, fiscal, o financiera.

### 3.2 Estado real de auditoría (verificado, sin inflar)

**Vouch402 no tiene contratos inteligentes propios.** Verificado contra `docs/TECHNICAL_SPEC.md` del proyecto: los esquemas de atestación se registran usando el SDK de EAS sobre contratos ya desplegados por Ethereum Attestation Service, no mediante contratos propios escritos y desplegados por Vouch402. Esto significa que no hay código de contrato propio que "autoauditar" ni que presentar como auditado.

Lo que Vouch402 sí usa, y no controla:

- **EAS (Ethereum Attestation Service):** según la documentación oficial del propio proyecto EAS, sus contratos "han sido auditados por Spearbit, una firma externa reconocida" (`https://github.com/ethereum-attestation-service/eas-docs-site/blob/main/docs/quick--start/faqs.md`, consultado el 16 de agosto de 2026). Esta auditoría es de EAS, no de Vouch402.
- **USDC (Circle) sobre Base:** un token ampliamente usado y públicamente documentado; este documento no afirma haber verificado de forma independiente el estado de auditoría del contrato de USDC.
- **La red Base** y su infraestructura de nodos RPC.

**El propio servidor de Vouch402 (el código Express/TypeScript que corre la API) no ha sido objeto de una auditoría de seguridad externa** hasta la fecha de este documento. Esto se declara aquí de forma explícita: no se afirma, en ningún lugar de este sitio, que Vouch402 "ha sido auditado" como si fuera equivalente a que un tercero independiente auditó su propio código de aplicación.

### 3.3 Naturaleza pública y permanente de los datos en blockchain

Reiterado de 1.2 por su importancia: cualquier dato escrito en una atestación EAS (incluyendo direcciones, hashes, y el texto libre de disputas) es público, permanente, e inmutable. No hay manera técnica de borrarlo, ni por el usuario ni por Vouch402.

### 3.4 Heurística de riesgo v0

El puntaje no es, ni pretende ser, un modelo de riesgo completo. Está documentado como tal desde la especificación técnica del propio proyecto ("v0 heuristic... NOT a complete risk model").

---

## 4. Preguntas abiertas para revisión de un abogado mexicano con cédula profesional vigente

Estas preguntas se documentan explícitamente, sin resolverse por cuenta propia, porque requieren criterio legal profesional:

1. **¿Encaja la actividad de Vouch402 en la fracción XVI del Artículo 17 de la LFPIORPI en absoluto?** El texto literal de la fracción XVI (verificado contra el decreto de reforma publicado en el DOF el 16 de julio de 2025, edición vespertina, `https://www.diputados.gob.mx/LeyesBiblio/ref/lfpiorpi/LFPIORPI_ref03_16jul25.pdf`) describe como Actividad Vulnerable a quien **facilita o realiza operaciones de compra o venta de activos virtuales propiedad de sus clientes**, o **provee medios para custodiar, almacenar, o transferir** activos virtuales de terceros. Vouch402 no hace ninguna de esas dos cosas: nunca compra, vende, custodia, almacena, ni transfiere activos virtuales por cuenta de un cliente; únicamente **recibe** USDC como pago por su propio servicio de datos, de forma análoga a cualquier comercio que acepta criptomonedas como forma de pago. La pregunta para el abogado es si "aceptar pago en cripto por un servicio propio" cae, o no, dentro del supuesto de la fracción XVI, o si queda fuera de su alcance por no involucrar activos de un cliente.

2. **Si la respuesta a la pregunta 1 fuera que sí aplica (por precaución):** el Acuerdo 115/2026 (Reglas de Carácter General, SHCP, publicado en el DOF el 7 de agosto de 2026, código 5795797, firmado el 24 de julio de 2026, verificado directamente contra el texto en `dof.gob.mx`) distingue dos supuestos distintos: el Artículo 24 Bis 3 (custodia, que exige control de los activos) y el Artículo 24 Bis 4 (facilitación o intermediación, que **no exige control**, y que podría aplicar aun cuando la plataforma nunca tenga las llaves, si conecta, concilia, o empareja una operación por cuenta de un cliente). Vouch402 nunca ejecuta ni construye la transacción del pagador (ver 1.3), solo la lee después de que ya ocurrió de forma independiente. La pregunta es si esta sola verificación de lectura, sin construir, rutear, ni conectar la operación con ninguna contraparte, podría de todos modos encuadrar como "facilitación o intermediación" bajo el Artículo 24 Bis 4. **Esta pregunta se deja explícitamente sin resolver por cuenta propia**, tal como se pidió.

3. **Fecha "17 de enero de 2027" citada como vigencia de la fracción XVI: origen probable encontrado, fecha correcta identificada, pero se pide confirmación del abogado antes de tratarla como definitiva.** Búsqueda ampliada, verificada contra tres documentos primarios distintos, no solo los dos ya revisados antes:
   - El decreto de reforma de la LFPIORPI de 2025 (DOF 16-jul-2025) entra en vigor, según su Transitorio Primero, "al día siguiente de su publicación" (17 de julio de 2025), "salvo las excepciones previstas en los siguientes artículos"; se revisaron los Transitorios Segundo a Sexto de ese decreto completo y ninguno establece una entrada en vigor diferida específicamente para la fracción XVI. Este punto ya estaba confirmado.
   - El Acuerdo 115/2026 entra en vigor de forma general el 30 de noviembre de 2026, con once fechas escalonadas para obligaciones específicas entre marzo de 2027 y enero de 2028; ninguna es el 17 de enero de 2027. También ya estaba confirmado.
   - **Lo nuevo:** se descargó y leyó el texto completo, vigente y consolidado de la propia LFPIORPI (`https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPIORPI.pdf`), que incluye, al final, los Artículos Transitorios de **todos** los decretos de reforma históricos de la ley, no solo el de 2025. Ahí aparece el texto exacto: "La adición de la fracción XVI del artículo 17 de esta Ley, entrará en vigor a los **dieciocho meses** siguientes a la entrada en vigor del presente Decreto", pero pertenece a un decreto **distinto y mucho más antiguo**: el que expidió la Ley para Regular las Instituciones de Tecnología Financiera (Ley Fintech), publicado en el DOF el **9 de marzo de 2018**, cuyo Artículo Décimo fue el que **originalmente agregó** la fracción XVI al artículo 17 (entonces con un contenido distinto al de activos virtuales que tiene hoy). Ese decreto de 2018 entró en vigor el 10 de marzo de 2018, así que sus "dieciocho meses" vencieron alrededor de septiembre de 2019, sin relación con activos virtuales ni con la reforma de 2025.
   - **Conclusión más probable, no confirmada como la causa exacta del error:** parece que una fuente secundaria encontró esta cláusula real de "dieciocho meses" (ligada a la fracción XVI, pero del decreto de 2018), y la recalculó por error contra la fecha de la reforma de 2025 en lugar de la fecha del decreto de 2018 al que en realidad pertenece, produciendo el "17 de enero de 2027" que circula en blogs de cumplimiento. Es una hipótesis bien fundada, respaldada por encontrar la cláusula real palabra por palabra, pero **no es una confirmación de que así ocurrió específicamente**; se pide al abogado validarla antes de repetirla como un hecho establecido.
   - **Para efectos prácticos de este documento:** la fecha de vigencia de la fracción XVI **tal como existe hoy, en su redacción de activos virtuales**, es el 17 de julio de 2025 (fecha general del decreto de 2025, sin excepción encontrada para esa fracción), con las obligaciones operativas del Acuerdo 115/2026 escalonándose entre el 30 de noviembre de 2026 y enero de 2028 según la obligación específica. El "17 de enero de 2027" no debe usarse en comunicación pública de este proyecto salvo que el abogado lo confirme por una vía distinta a las tres fuentes ya revisadas aquí.

4. **Identidad del responsable (LFPDPPP) y mecanismo de ejercicio de derechos ARCO:** no existe, en el repositorio del proyecto ni en su dominio, una razón social, RFC, ni domicilio identificados. El Aviso de Privacidad de la sección 1 no puede considerarse completo ni operativo hasta que exista esa identificación y un canal de contacto real (por ejemplo, un correo electrónico dedicado) para ejercer derechos ARCO.

5. **¿Genera obligaciones de protección de datos la consulta del riesgo de la dirección de un tercero** (quien nunca interactuó con Vouch402, nunca dio consentimiento, y podría no saber que fue consultado), especialmente cuando `makePublic: true` hace pública esa consulta y su resultado de forma permanente?

6. **Ley aplicable y foro de resolución de disputas** para controversias que no se resuelven mediante el mecanismo de disputa en cadena (sección 2.4 y 2.9): no definido en este borrador.

7. **Alcance multijurisdiccional:** este documento no cubre RGPD/GDPR (Unión Europea), leyes estatales de privacidad de Estados Unidos, ni ningún marco fuera de México, pese a que el producto es de acceso público y global. Se requiere una revisión separada, con asesoría local en cada mercado relevante, antes de afirmar cumplimiento fuera de México.

8. **Política de retención de datos fuera de cadena:** el código actual no define un período de retención ni un mecanismo de borrado para los datos guardados en la base de datos propia del servidor (fuera de lo que ya queda permanentemente en la blockchain). Es una decisión de producto pendiente.
