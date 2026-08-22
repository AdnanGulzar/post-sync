/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

// Without this augmentation `import.meta.env` is untyped, which is why the
// api.ts files carried an `as any` cast just to read VITE_API_URL.
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
