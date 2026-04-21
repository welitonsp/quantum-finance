/// <reference types="vite/client" />

declare module '*?worker' {
  const workerConstructor: {
    new (options?: { name?: string }): Worker;
  };
  export default workerConstructor;
}

declare module '*?url' {
  const url: string;
  export default url;
}

declare module '*.css';
