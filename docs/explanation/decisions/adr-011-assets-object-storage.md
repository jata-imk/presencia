# ADR-011 · Assets (Biblioteca): Object Storage externo desde día 1

**Decisión:** Cloudflare R2 u Object Storage de Contabo (API S3). NO MinIO local en el VDS. Buckets: assets de Biblioteca (prefijo por usuario) + backups.

**Razón:** Las imágenes generadas son el devorador de disco (1–3 MB × usuarios × iteraciones). Fuera del VDS: el disco dura años, un contenedor menos, y los assets sobreviven si el servidor arde. El SDK S3 hace el cambio de proveedor trivial.
