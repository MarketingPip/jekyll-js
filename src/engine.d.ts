/**
 * TypeScript definitions for jekyll-js.
 * Client-side Jekyll engine: render, navigate, and edit Jekyll sites
 * entirely in JavaScript. No Ruby required.
 */

export interface JekyllEngineOptions {
  /** Virtual file system: { "path/to/file": "content" } */
  vfs?: Record<string, string>;
  /** (message, level) => void. Default: no-op. */
  logger?: (message: string, level: 'info' | 'warn' | 'error' | 'success') => void;
  /** Called for each rendered page. Use to stream output. */
  stdout?: (page: RenderedPage) => void;
  /** Enable template caching. Default: true. */
  cache?: boolean;
  /** Jekyll environment. Default: 'development'. */
  environment?: string;
  /** Custom related-posts function. */
  relatedPostsFn?: (post: any) => any[];
  /** Sass compiler (dart-sass). Required if site uses Sass. */
  sass?: any;
  /** Syntax highlighter (highlight.js). Required for {% highlight %}. */
  highlighter?: any;
}

export interface RenderedPage {
  /** Source path, e.g. "index.md" */
  path: string;
  /** Output URL, e.g. "/about/" */
  permalink: string;
  /** Front matter attributes */
  data: Record<string, any>;
  /** Rendered HTML */
  content: string;
  /** Paginator object, if paginated */
  paginator?: any;
}

export interface SiteObject {
  /** _config.yml values */
  config: Record<string, any>;
  /** Collections: { name: { docs: CollectionDoc[] } } */
  collections: Record<string, { docs: CollectionDoc[] }>;
  /** Mutable array of pages. Plugins push new pages here. */
  pages: any[];
  /** _data/ files */
  data: Record<string, any>;
  /** Source directory (VFS root) */
  source: string;
}

export interface CollectionDoc {
  path: string;
  content: string;
  /** Front matter (Ruby: doc.data['title']) */
  data: Record<string, any>;
  /** Document date as Date object */
  date: Date | null;
  [key: string]: any;
}

export interface CreatePageOptions {
  /** Directory, e.g. "exhibits/categories/art" */
  dir?: string;
  /** Filename, e.g. "index.html" */
  name: string;
  /** Layout name, e.g. "default" */
  layout?: string;
  /** Markdown body content */
  content?: string;
}

export interface PluginPage {
  path: string;
  dir: string;
  name: string;
  content: string;
  data: Record<string, any>;
}

export type HookOwner = 'site' | 'pages' | 'posts' | 'documents' | string;
export type HookEvent = 'post_read' | 'post_init' | 'pre_render' | 'post_render' | string;
export type LifecycleEvent = 'pre:build' | 'post:build' | 'pre:render' | 'post:render';

export declare class JekyllEngine {
  constructor(options?: JekyllEngineOptions);

  // Core
  build(): Promise<RenderedPage[]>;
  useVFS(vfs: Record<string, string>): this;

  // Programmatic VFS
  writeFile(path: string, content: string): this;
  readFile(path: string): string | undefined;
  removeFile(path: string): this;
  listFiles(): string[];

  // Fluent builder
  setConfig(config: Record<string, any> | string): this;
  addLayout(name: string, content: string): this;
  addInclude(name: string, content: string): this;
  addData(name: string, data: Record<string, any> | string): this;
  addCollection(name: string, pages: Array<{ path: string; content: string }>): this;
  addPage(path: string, content: string): this;

  // JS Plugin API
  use(pluginFn: (engine: JekyllEngine) => void): this;
  registerHook(owner: HookOwner, event: HookEvent, fn: (...args: any[]) => void): this;
  triggerHook(owner: HookOwner, event: HookEvent, ...args: any[]): void;
  registerGenerator(fn: (site: SiteObject) => void): this;
  registerTag(name: string, fn: (text: string) => string): this;
  registerFilter(name: string, fn: (...args: any[]) => any): this;
  createPage(opts: CreatePageOptions): PluginPage;
  fileExists(path: string): boolean;

  get logger(): {
    warn: (msg: string) => void;
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
  get utils(): {
    slugify: (str: string) => string;
  };

  // Lifecycle events
  on(event: LifecycleEvent, cb: (...args: any[]) => void): this;

  // Static
  static render(vfs: Record<string, string>, options?: JekyllEngineOptions): Promise<RenderedPage[]>;
}

export default JekyllEngine;
