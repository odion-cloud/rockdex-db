/**
 * Cross-platform Path Manager with ES6 imports
 * Handles path operations, aliases, and resolution for both Node.js and Browser environments
 * @version 1.0.0
 * @author https://github.com/odion-cloud
 */

class PathManager {
    constructor() {
        this.isNode = typeof window === 'undefined' && typeof global !== 'undefined';
        this.isBrowser = typeof window !== 'undefined';
        this._nodeModules = null;
        this._initialized = false;
        this._aliases = new Map();
        this._basePaths = new Map();
        this._pathSeparator = this.isNode ? require('path').sep : '/';
        
        // Default aliases
        this._setupDefaultAliases();
    }

    /**
     * Initialize the path manager
     * @returns {Promise<void>}
     */
    async init() {
        if (this._initialized) return;
        
        if (this.isNode) {
            await this._initNodeModules();
            this._pathSeparator = this._nodeModules.path.sep;
        }
        
        this._initialized = true;
    }

    /**
     * Initialize Node.js modules using ES6 imports
     * @private
     */
    async _initNodeModules() {
        if (this._nodeModules) return this._nodeModules;
        
        try {
            // Try ES6 dynamic imports first
            const [path, os] = await Promise.all([
                import('path'),
                import('os')
            ]);
            
            this._nodeModules = {
                path: path.default || path,
                os: os.default || os
            };
        } catch (error) {
            // Fallback to require for older Node.js versions
            this._nodeModules = {
                path: require('path'),
                os: require('os')
            };
        }
        
        return this._nodeModules;
    }

    /**
     * Setup default path aliases
     * @private
     */
    _setupDefaultAliases() {
        // Common aliases inspired by modern development practices
        this._aliases.set('~', './src');           // Source directory
        this._aliases.set('@', './');             // Root directory
        this._aliases.set('#', './config');       // Config directory
        this._aliases.set('$', './assets');       // Assets directory
        this._aliases.set('%', './data');         // Data directory
        this._aliases.set('&', './components');   // Components directory
        this._aliases.set('*', './utils');        // Utils directory
        this._aliases.set('+', './lib');          // Library directory
    }

    /**
     * Add or update a custom path alias
     * @param {string} alias - The alias symbol (e.g., '~', '@')
     * @param {string} path - The path to resolve to
     * @returns {PathManager}
     */
    setAlias(alias, path) {
        this._aliases.set(alias, path);
        return this;
    }

    /**
     * Remove a path alias
     * @param {string} alias 
     * @returns {PathManager}
     */
    removeAlias(alias) {
        this._aliases.delete(alias);
        return this;
    }

    /**
     * Get all registered aliases
     * @returns {Object}
     */
    getAliases() {
        return Object.fromEntries(this._aliases);
    }

    /**
     * Set base path for a specific context
     * @param {string} context - Context name (e.g., 'database', 'assets')
     * @param {string} basePath - Base path for the context
     * @returns {PathManager}
     */
    setBasePath(context, basePath) {
        this._basePaths.set(context, basePath);
        return this;
    }

    /**
     * Resolve a path with alias support
     * @param {string} inputPath - Path that may contain aliases
     * @param {string} context - Optional context for base path resolution
     * @returns {Promise<string>}
     */
    async resolve(inputPath, context = null) {
        await this.init();
        
        if (!inputPath || typeof inputPath !== 'string') {
            throw new Error('Invalid path provided');
        }

        let resolvedPath = inputPath;

        // Handle alias resolution
        resolvedPath = this._resolveAliases(resolvedPath);

        // Handle context-based base paths
        if (context && this._basePaths.has(context)) {
            const basePath = this._basePaths.get(context);
            resolvedPath = await this.join(basePath, resolvedPath);
        }

        // Normalize the path
        resolvedPath = await this.normalize(resolvedPath);

        return resolvedPath;
    }

    /**
     * Resolve aliases in a path
     * @param {string} path 
     * @returns {string}
     * @private
     */
    _resolveAliases(path) {
        for (const [alias, aliasPath] of this._aliases.entries()) {
            if (path.startsWith(alias + '/') || path === alias) {
                return path.replace(alias, aliasPath);
            }
        }
        return path;
    }

    /**
     * Join multiple path segments
     * @param {...string} paths - Path segments to join
     * @returns {Promise<string>}
     */
    async join(...paths) {
        await this.init();
        
        if (this.isNode) {
            return this._nodeModules.path.join(...paths);
        } else {
            // Browser implementation
            return paths
                .filter(path => path && path !== '')
                .join('/')
                .replace(/\/+/g, '/');
        }
    }

    /**
     * Get directory name from path
     * @param {string} path 
     * @returns {Promise<string>}
     */
    async dirname(path) {
        await this.init();
        
        if (this.isNode) {
            return this._nodeModules.path.dirname(path);
        } else {
            const lastSlash = path.lastIndexOf('/');
            return lastSlash > -1 ? path.substring(0, lastSlash) : '.';
        }
    }

    /**
     * Get file name from path
     * @param {string} path 
     * @param {string} ext - Optional extension to remove
     * @returns {Promise<string>}
     */
    async basename(path, ext = null) {
        await this.init();
        
        if (this.isNode) {
            return ext ? this._nodeModules.path.basename(path, ext) : this._nodeModules.path.basename(path);
        } else {
            const name = path.substring(path.lastIndexOf('/') + 1);
            if (ext && name.endsWith(ext)) {
                return name.slice(0, -ext.length);
            }
            return name;
        }
    }

    /**
     * Get file extension from path
     * @param {string} path 
     * @returns {Promise<string>}
     */
    async extname(path) {
        await this.init();
        
        if (this.isNode) {
            return this._nodeModules.path.extname(path);
        } else {
            const lastDot = path.lastIndexOf('.');
            const lastSlash = path.lastIndexOf('/');
            return (lastDot > lastSlash && lastDot > -1) ? path.substring(lastDot) : '';
        }
    }

    /**
     * Normalize a path
     * @param {string} path 
     * @returns {Promise<string>}
     */
    async normalize(path) {
        await this.init();
        
        if (this.isNode) {
            return this._nodeModules.path.normalize(path);
        } else {
            // Browser path normalization
            return path
                .replace(/\/+/g, '/')        // Multiple slashes to single
                .replace(/\/\./g, '/')       // Remove /./ 
                .replace(/\/[^\/]+\/\.\./g, '') // Remove /dir/../
                .replace(/\/$/, '') || '/';  // Remove trailing slash
        }
    }

    /**
     * Check if path is absolute
     * @param {string} path 
     * @returns {Promise<boolean>}
     */
    async isAbsolute(path) {
        await this.init();
        
        if (this.isNode) {
            return this._nodeModules.path.isAbsolute(path);
        } else {
            return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path);
        }
    }

    /**
     * Convert path to relative from a base path
     * @param {string} from 
     * @param {string} to 
     * @returns {Promise<string>}
     */
    async relative(from, to) {
        await this.init();
        
        if (this.isNode) {
            return this._nodeModules.path.relative(from, to);
        } else {
            // Simple browser implementation
            const fromParts = from.split('/').filter(p => p !== '');
            const toParts = to.split('/').filter(p => p !== '');
            
            // Find common prefix
            let commonLength = 0;
            for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
                if (fromParts[i] === toParts[i]) {
                    commonLength++;
                } else {
                    break;
                }
            }
            
            // Build relative path
            const upLevels = fromParts.length - commonLength;
            const relativeParts = Array(upLevels).fill('..').concat(toParts.slice(commonLength));
            
            return relativeParts.join('/') || '.';
        }
    }

    /**
     * Parse a path into components
     * @param {string} path 
     * @returns {Promise<Object>}
     */
    async parse(path) {
        await this.init();
        
        if (this.isNode) {
            return this._nodeModules.path.parse(path);
        } else {
            const dir = await this.dirname(path);
            const base = await this.basename(path);
            const ext = await this.extname(path);
            const name = await this.basename(path, ext);
            
            return {
                root: path.startsWith('/') ? '/' : '',
                dir,
                base,
                ext,
                name
            };
        }
    }

    /**
     * Format a path object into a path string
     * @param {Object} pathObject 
     * @returns {Promise<string>}
     */
    async format(pathObject) {
        await this.init();
        
        if (this.isNode) {
            return this._nodeModules.path.format(pathObject);
        } else {
            const { root = '', dir = '', base = '', name = '', ext = '' } = pathObject;
            const finalDir = dir || root;
            const finalBase = base || (name + ext);
            return finalDir ? await this.join(finalDir, finalBase) : finalBase;
        }
    }

    /**
     * Validate path security (prevent directory traversal)
     * @param {string} path 
     * @param {string} allowedBasePath 
     * @returns {Promise<boolean>}
     */
    async isSecurePath(path, allowedBasePath = './') {
        await this.init();
        
        try {
            const resolvedPath = await this.resolve(path);
            const normalizedPath = await this.normalize(resolvedPath);
            const normalizedBase = await this.normalize(allowedBasePath);
            
            // Check if the resolved path starts with the allowed base path
            return normalizedPath.startsWith(normalizedBase);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get path separator for current platform
     * @returns {string}
     */
    getSeparator() {
        return this._pathSeparator;
    }

    /**
     * Convert path separators to current platform
     * @param {string} path 
     * @returns {Promise<string>}
     */
    async toPlatformPath(path) {
        await this.init();
        
        if (this.isNode) {
            const sep = this._nodeModules.path.sep;
            return path.replace(/[\/\\]/g, sep);
        } else {
            return path.replace(/\\/g, '/');
        }
    }

    /**
     * Convert path to URL format (forward slashes)
     * @param {string} path 
     * @returns {string}
     */
    toUrlPath(path) {
        return path.replace(/\\/g, '/');
    }

    /**
     * Generate a unique path with timestamp
     * @param {string} basePath 
     * @param {string} prefix 
     * @param {string} extension 
     * @returns {Promise<string>}
     */
    async generateUniqueePath(basePath, prefix = 'file', extension = '') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const fileName = `${prefix}_${timestamp}_${random}${extension}`;
        return await this.join(basePath, fileName);
    }

    /**
     * Create path with custom pattern
     * @param {string} pattern - Pattern with placeholders like {year}, {month}, {day}
     * @param {Object} context - Context data for replacements
     * @returns {Promise<string>}
     */
    async createFromPattern(pattern, context = {}) {
        await this.init();
        
        const now = new Date();
        const defaultContext = {
            year: now.getFullYear(),
            month: String(now.getMonth() + 1).padStart(2, '0'),
            day: String(now.getDate()).padStart(2, '0'),
            hour: String(now.getHours()).padStart(2, '0'),
            minute: String(now.getMinutes()).padStart(2, '0'),
            timestamp: now.getTime(),
            random: Math.random().toString(36).substring(7)
        };
        
        const finalContext = { ...defaultContext, ...context };
        
        let result = pattern;
        for (const [key, value] of Object.entries(finalContext)) {
            const placeholder = `{${key}}`;
            result = result.replace(new RegExp(placeholder, 'g'), value);
        }
        
        return await this.normalize(result);
    }

    /**
     * Get file paths matching a pattern
     * @param {string} pattern - Glob-like pattern
     * @param {string} basePath - Base directory to search
     * @returns {Promise<Array>}
     */
    async glob(pattern, basePath = './') {
        // This is a simplified implementation
        // In a real scenario, you might want to use a proper glob library
        const results = [];
        
        if (pattern.includes('*')) {
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            
            const regex = new RegExp(`^${regexPattern}$`);
            
            // This would need integration with FolderManager to list files
            // For now, return empty array
            return results;
        }
        
        return [pattern];
    }

    /**
     * Get platform-specific information
     * @returns {Promise<Object>}
     */
    async getPlatformInfo() {
        await this.init();
        
        if (this.isNode) {
            const os = this._nodeModules.os;
            return {
                platform: os.platform(),
                separator: this._nodeModules.path.sep,
                delimiter: this._nodeModules.path.delimiter,
                homedir: os.homedir(),
                tmpdir: os.tmpdir(),
                environment: 'node'
            };
        } else {
            return {
                platform: 'browser',
                separator: '/',
                delimiter: ':',
                homedir: null,
                tmpdir: null,
                environment: 'browser',
                userAgent: navigator.userAgent
            };
        }
    }

    /**
     * Check path capabilities for current environment
     * @returns {Object}
     */
    getCapabilities() {
        return {
            environment: this.isNode ? 'node' : 'browser',
            aliases: true,
            normalize: true,
            resolve: true,
            relative: true,
            parse: true,
            format: true,
            security: true,
            patterns: true,
            platformConversion: true,
            nodePathSupported: this.isNode,
            urlPathSupported: true
        };
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PathManager;
} else if (typeof define === 'function' && define.amd) {
    define([], () => PathManager);
} else if (typeof window !== 'undefined') {
    window.PathManager = PathManager;
}
