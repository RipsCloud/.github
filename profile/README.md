<p align="center">
  <img src="assets/ripscloud-icon.png" alt="RipsCloud" width="112" height="112">
</p>

<h1 align="center">RipsCloud</h1>

<p align="center">
  <strong>Gestión, automatización y envío de RIPS para prestadores de salud en Colombia.</strong>
</p>

<p align="center">
  <a href="https://ripscloud.com">Sitio web</a>
  ·
  <a href="https://app.ripscloud.com">App</a>
  ·
  <a href="https://api.ripscloud.com/swagger">API</a>
  ·
  <a href="mailto:hola@ripscloud.com">Contacto</a>
</p>

## Qué Es RipsCloud

RipsCloud es una plataforma cloud para administrar el flujo RIPS de prestadores
de salud en Colombia. Ayuda a equipos administrativos, facturación y tecnología
a centralizar la operación alrededor de RIPS, FEV RIPS, SISPRO y los servicios
del Ministerio de Salud, sin exponer credenciales operativas en el navegador.

El producto nace para simplificar un flujo que suele mezclar archivos,
validaciones, credenciales, respuestas técnicas y seguimiento manual. RipsCloud
actúa como una capa multi-tenant para organizar el acceso, automatizar llamadas
y dar trazabilidad a los procesos relacionados con RIPS.

## A Quién Sirve

- IPS, clínicas, centros médicos y consultorios que reportan RIPS en Colombia.
- Equipos de facturación en salud que necesitan reducir reprocesos y rechazos.
- Áreas administrativas que hacen seguimiento a envíos, CUV, respuestas y
  evidencias.
- Equipos técnicos que integran sistemas clínicos, facturación electrónica en
  salud y servicios SISPRO.

## Capacidades Principales

- Gestión multi-tenant por prestador, sede o unidad operativa.
- Autenticación centralizada hacia servicios FEV RIPS / SISPRO.
- Inyección automática de tokens para llamadas operativas posteriores.
- Reintento controlado cuando una sesión expira o una respuesta requiere
  renovación de autenticación.
- Consulta y automatización de endpoints relacionados con RIPS, CUV y procesos
  de envío.
- Base para integraciones con sistemas clínicos, historias clínicas, facturación
  electrónica en salud y backoffices administrativos.
- Registro técnico para trazabilidad, soporte y auditoría operacional.

## Contexto RIPS En Colombia

RIPS significa Registro Individual de Prestación de Servicios de Salud. En el
contexto colombiano, los RIPS son parte del flujo administrativo y técnico de los
prestadores de salud y se relacionan con la Factura Electrónica de Venta en
salud, validaciones y reportes ante entidades del sistema.

RipsCloud usa estos términos de forma operativa y técnica. La plataforma no
reemplaza la asesoría normativa, tributaria o jurídica de cada prestador; está
diseñada para ayudar a ejecutar, integrar y controlar el flujo digital.

## Cómo Funciona

1. El prestador o sistema integrado entra a RipsCloud por una ruta tenant.
2. RipsCloud centraliza el inicio de sesión operativo hacia SISPRO.
3. La sesión se conserva en infraestructura cloud aislada por tenant.
4. Las llamadas posteriores se envían autenticadas automáticamente.
5. Los equipos pueden construir flujos de consulta, envío, reintento y
   seguimiento sobre una API estable.

## Información Pública Y Contacto

- Web: [ripscloud.com](https://ripscloud.com)
- App: [app.ripscloud.com](https://app.ripscloud.com)
- API: [api.ripscloud.com](https://api.ripscloud.com)
- Contacto: [hola@ripscloud.com](mailto:hola@ripscloud.com)
- Mercado principal: Colombia
- Industria: healthtech, software de salud, RIPS, facturación en salud

## Sobre Esta Organización En GitHub

Esta organización publica documentación, perfiles de producto y, cuando aplique,
SDKs o herramientas públicas alrededor de RipsCloud. Los repositorios
operacionales y el código fuente privado del producto viven en repositorios
privados.

Si buscas soporte comercial, integración o acceso al producto, usa los canales
públicos de contacto en [ripscloud.com](https://ripscloud.com).
