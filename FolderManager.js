/**
 * Cross-platform Folder Manager with ES6 imports
 * Handles directory operations for both Node.js and Browser environments
 * @version 1.0.0
 * @author https://github.com/odion-cloud
 */

class FolderManager {
    constructor() {
        this.isNode = typeof window === 'undefined' && typeof global !== 'undefined';
        this.isBrowser = typeof window !== 'undefined';
        this._nodeModules = null;
        this._initialized = false;
        this._directoryHandle = null; // For File System Access API
    }

    /**
     * Initialize the folder manager
     * @returns {Promise<void>}
     */
    async init() {
        if (this._initialized) return;
        
        if (this.isNode) {
            await this._initNodeModules();
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
            const [fs, path] = await Promise.all([
                import('fs'),
                import('path')
            ]);
            
            this._nodeModules = {
                fs: fs.default || fs,
                path: path.default || path
            };
        } catch (error) {
            // Fallback to require for older Node.js versions
            this._nodeModules = {
                fs: require('fs'),
                path: require('path')
            };
        }
        
        return this._nodeModules;
    }

    /**
     * Check if a directory exists
     * @param {string} dirPath 
     * @returns {Promise<boolean>}
     */
    async exists(dirPath) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            try {
                const stats = modules.fs.statSync(dirPath);
                return stats.isDirectory();
            } catch {
                return false;
            }
        }
        
        // Browser: Can't directly check directory existence
        return false;
    }

    /**
     * Create a directory (with recursive option)
     * @param {string} dirPath 
     * @param {Object} options 
     * @returns {Promise<boolean>}
     */
    async create(dirPath, options = { recursive: true }) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                if (!modules.fs.existsSync(dirPath)) {
                    modules.fs.mkdirSync(dirPath, { recursive: options.recursive });
                    return true;
                }
                return false; // Already exists
            } catch (error) {
                throw new Error(`Failed to create directory: ${error.message}`);
            }
        }
        
        throw new Error('Direct directory creation not supported in browser. Use File System Access API.');
    }

    /**
     * Delete a directory
     * @param {string} dirPath 
     * @param {Object} options 
     * @returns {Promise<boolean>}
     */
    async delete(dirPath, options = { recursive: false }) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                if (modules.fs.existsSync(dirPath)) {
                    if (options.recursive) {
                        modules.fs.rmSync(dirPath, { recursive: true, force: true });
                    } else {
                        modules.fs.rmdirSync(dirPath);
                    }
                    return true;
                }
                return false;
            } catch (error) {
                throw new Error(`Failed to delete directory: ${error.message}`);
            }
        }
        
        throw new Error('Direct directory deletion not supported in browser. Use File System Access API.');
    }

    /**
     * List directory contents
     * @param {string} dirPath 
     * @param {Object} options 
     * @returns {Promise<Array>}
     */
    async list(dirPath, options = { withFileTypes: false }) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                if (options.withFileTypes) {
                    const entries = modules.fs.readdirSync(dirPath, { withFileTypes: true });
                    return entries.map(entry => ({
                        name: entry.name,
                        isFile: entry.isFile(),
                        isDirectory: entry.isDirectory(),
                        isSymbolicLink: entry.isSymbolicLink()
                    }));
                } else {
                    return modules.fs.readdirSync(dirPath);
                }
            } catch (error) {
                throw new Error(`Failed to list directory: ${error.message}`);
            }
        }
        
        throw new Error('Direct directory listing not supported in browser. Use File System Access API.');
    }

    /**
     * Copy a directory recursively
     * @param {string} sourcePath 
     * @param {string} destPath 
     * @returns {Promise<boolean>}
     */
    async copy(sourcePath, destPath) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                const copyRecursive = (src, dest) => {
                    const stats = modules.fs.statSync(src);
                    
                    if (stats.isDirectory()) {
                        if (!modules.fs.existsSync(dest)) {
                            modules.fs.mkdirSync(dest, { recursive: true });
                        }
                        
                        const entries = modules.fs.readdirSync(src);
                        for (const entry of entries) {
                            const srcPath = modules.path.join(src, entry);
                            const destPath = modules.path.join(dest, entry);
                            copyRecursive(srcPath, destPath);
                        }
                    } else {
                        modules.fs.copyFileSync(src, dest);
                    }
                };
                
                copyRecursive(sourcePath, destPath);
                return true;
            } catch (error) {
                throw new Error(`Failed to copy directory: ${error.message}`);
            }
        }
        
        throw new Error('Direct directory copying not supported in browser. Use File System Access API.');
    }

    /**
     * Move/rename a directory
     * @param {string} sourcePath 
     * @param {string} destPath 
     * @returns {Promise<boolean>}
     */
    async move(sourcePath, destPath) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                modules.fs.renameSync(sourcePath, destPath);
                return true;
            } catch (error) {
                throw new Error(`Failed to move directory: ${error.message}`);
            }
        }
        
        throw new Error('Direct directory moving not supported in browser. Use File System Access API.');
    }

    /**
     * Get directory statistics
     * @param {string} dirPath 
     * @returns {Promise<Object>}
     */
    async stats(dirPath) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                const stats = modules.fs.statSync(dirPath);
                const contents = modules.fs.readdirSync(dirPath, { withFileTypes: true });
                
                return {
                    created: stats.birthtime,
                    modified: stats.mtime,
                    accessed: stats.atime,
                    totalItems: contents.length,
                    files: contents.filter(item => item.isFile()).length,
                    directories: contents.filter(item => item.isDirectory()).length,
                    size: this._calculateDirectorySize(dirPath, modules)
                };
            } catch (error) {
                throw new Error(`Failed to get directory stats: ${error.message}`);
            }
        }
        
        throw new Error('Direct directory stats not supported in browser.');
    }

    /**
     * Calculate total size of directory
     * @param {string} dirPath 
     * @param {Object} modules 
     * @returns {number}
     * @private
     */
    _calculateDirectorySize(dirPath, modules) {
        let totalSize = 0;
        
        const calculateSize = (path) => {
            const stats = modules.fs.statSync(path);
            
            if (stats.isFile()) {
                totalSize += stats.size;
            } else if (stats.isDirectory()) {
                const contents = modules.fs.readdirSync(path);
                for (const item of contents) {
                    calculateSize(modules.path.join(path, item));
                }
            }
        };
        
        try {
            calculateSize(dirPath);
        } catch (error) {
            // Ignore errors for inaccessible files/directories
        }
        
        return totalSize;
    }

    /**
     * Find files in directory (recursive search)
     * @param {string} dirPath 
     * @param {Object} options 
     * @returns {Promise<Array>}
     */
    async find(dirPath, options = {}) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            const {
                pattern = null,
                extension = null,
                recursive = true,
                includeDirectories = false
            } = options;
            
            const results = [];
            
            const searchRecursive = (currentPath) => {
                try {
                    const contents = modules.fs.readdirSync(currentPath, { withFileTypes: true });
                    
                    for (const entry of contents) {
                        const fullPath = modules.path.join(currentPath, entry.name);
                        
                        if (entry.isFile()) {
                            let include = true;
                            
                            if (pattern && !new RegExp(pattern).test(entry.name)) {
                                include = false;
                            }
                            
                            if (extension && !entry.name.endsWith(extension)) {
                                include = false;
                            }
                            
                            if (include) {
                                results.push({
                                    path: fullPath,
                                    name: entry.name,
                                    type: 'file'
                                });
                            }
                        } else if (entry.isDirectory()) {
                            if (includeDirectories) {
                                results.push({
                                    path: fullPath,
                                    name: entry.name,
                                    type: 'directory'
                                });
                            }
                            
                            if (recursive) {
                                searchRecursive(fullPath);
                            }
                        }
                    }
                } catch (error) {
                    // Ignore errors for inaccessible directories
                }
            };
            
            searchRecursive(dirPath);
            return results;
        }
        
        throw new Error('Directory search not supported in browser.');
    }

    /**
     * Browser-specific directory operations using File System Access API
     */

    /**
     * Request directory access in browser
     * @param {Object} options 
     * @returns {Promise<FileSystemDirectoryHandle>}
     */
    async requestDirectoryAccess(options = {}) {
        if (!this.isBrowser) {
            throw new Error('Directory access only available in browser');
        }
        
        if (!('showDirectoryPicker' in window)) {
            throw new Error('File System Access API not supported in this browser');
        }
        
        try {
            this._directoryHandle = await window.showDirectoryPicker({
                mode: options.mode || 'readwrite',
                startIn: options.startIn || 'documents'
            });
            
            return this._directoryHandle;
        } catch (error) {
            throw new Error(`Failed to access directory: ${error.message}`);
        }
    }

    /**
     * List directory contents in browser
     * @returns {Promise<Array>}
     */
    async listInBrowser() {
        if (!this.isBrowser || !this._directoryHandle) {
            throw new Error('Directory handle not available');
        }
        
        const entries = [];
        
        for await (const [name, handle] of this._directoryHandle.entries()) {
            entries.push({
                name,
                kind: handle.kind,
                handle
            });
        }
        
        return entries;
    }

    /**
     * Create subdirectory in browser
     * @param {string} name 
     * @returns {Promise<FileSystemDirectoryHandle>}
     */
    async createSubdirectoryInBrowser(name) {
        if (!this.isBrowser || !this._directoryHandle) {
            throw new Error('Directory handle not available');
        }
        
        try {
            return await this._directoryHandle.getDirectoryHandle(name, { create: true });
        } catch (error) {
            throw new Error(`Failed to create subdirectory: ${error.message}`);
        }
    }

    /**
     * Get file handle in browser directory
     * @param {string} fileName 
     * @param {Object} options 
     * @returns {Promise<FileSystemFileHandle>}
     */
    async getFileHandleInBrowser(fileName, options = {}) {
        if (!this.isBrowser || !this._directoryHandle) {
            throw new Error('Directory handle not available');
        }
        
        try {
            return await this._directoryHandle.getFileHandle(fileName, {
                create: options.create || false
            });
        } catch (error) {
            throw new Error(`Failed to get file handle: ${error.message}`);
        }
    }

    /**
     * Check if File System Access API is supported
     * @returns {boolean}
     */
    isFileSystemAccessSupported() {
        return this.isBrowser && 'showDirectoryPicker' in window;
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FolderManager;
} else if (typeof define === 'function' && define.amd) {
    define([], () => FolderManager);
} else if (typeof window !== 'undefined') {
    window.FolderManager = FolderManager;
}
