// Type declarations for CSS module imports (Vite ?inline suffix)
declare module "*.css?inline" {
  const content: string;
  export default content;
}
