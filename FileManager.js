/**
 * Cross-platform File Manager with ES6 imports
 * Handles file operations for both Node.js and Browser environments
 * @version 1.0.0
 * @author https://github.com/odion-cloud
 */

class FileManager {
    constructor() {
        this.isNode = typeof window === 'undefined' && typeof global !== 'undefined';
        this.isBrowser = typeof window !== 'undefined';
        this._nodeModules = null;
        this._initialized = false;
    }

    /**
     * Initialize the file manager
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
     * Check if a file exists
     * @param {string} filePath 
     * @returns {Promise<boolean>}
     */
    async exists(filePath) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            return modules.fs.existsSync(filePath);
        }
        
        // Browser: Can't directly check file existence
        return false;
    }

    /**
     * Read file content
     * @param {string} filePath 
     * @param {string} encoding 
     * @returns {Promise<string>}
     */
    async read(filePath, encoding = 'utf8') {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            return modules.fs.readFileSync(filePath, encoding);
        }
        
        throw new Error('Direct file reading not supported in browser. Use File System Access API or file input.');
    }

    /**
     * Write content to file
     * @param {string} filePath 
     * @param {string} data 
     * @param {string} encoding 
     * @returns {Promise<boolean>}
     */
    async write(filePath, data, encoding = 'utf8') {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                // Atomic write using temporary file
                const tempPath = `${filePath}.tmp`;
                modules.fs.writeFileSync(tempPath, data, encoding);
                modules.fs.renameSync(tempPath, filePath);
                return true;
            } catch (error) {
                throw new Error(`Failed to write file: ${error.message}`);
            }
        }
        
        throw new Error('Direct file writing not supported in browser. Use File System Access API.');
    }

    /**
     * Delete a file
     * @param {string} filePath 
     * @returns {Promise<boolean>}
     */
    async delete(filePath) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                if (modules.fs.existsSync(filePath)) {
                    modules.fs.unlinkSync(filePath);
                    return true;
                }
                return false;
            } catch (error) {
                throw new Error(`Failed to delete file: ${error.message}`);
            }
        }
        
        throw new Error('Direct file deletion not supported in browser. Use File System Access API.');
    }

    /**
     * Copy a file
     * @param {string} sourcePath 
     * @param {string} destPath 
     * @returns {Promise<boolean>}
     */
    async copy(sourcePath, destPath) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                modules.fs.copyFileSync(sourcePath, destPath);
                return true;
            } catch (error) {
                throw new Error(`Failed to copy file: ${error.message}`);
            }
        }
        
        throw new Error('Direct file copying not supported in browser. Use File System Access API.');
    }

    /**
     * Move/rename a file
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
                throw new Error(`Failed to move file: ${error.message}`);
            }
        }
        
        throw new Error('Direct file moving not supported in browser. Use File System Access API.');
    }

    /**
     * Get file statistics
     * @param {string} filePath 
     * @returns {Promise<Object>}
     */
    async stats(filePath) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                const stats = modules.fs.statSync(filePath);
                return {
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    accessed: stats.atime,
                    isFile: stats.isFile(),
                    isDirectory: stats.isDirectory()
                };
            } catch (error) {
                throw new Error(`Failed to get file stats: ${error.message}`);
            }
        }
        
        throw new Error('Direct file stats not supported in browser.');
    }

    /**
     * Get path utilities
     * @returns {Promise<Object>}
     */
    async getPathUtils() {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            return modules.path;
        } else {
            // Browser path utilities
            return {
                join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
                dirname: (path) => path.substring(0, path.lastIndexOf('/')),
                basename: (path, ext) => {
                    const name = path.substring(path.lastIndexOf('/') + 1);
                    return ext ? name.replace(new RegExp(ext.replace('.', '\\.') + '$'), '') : name;
                },
                extname: (path) => {
                    const lastDot = path.lastIndexOf('.');
                    return lastDot > -1 ? path.substring(lastDot) : '';
                },
                resolve: (...paths) => {
                    let resolvedPath = '';
                    for (let i = paths.length - 1; i >= 0; i--) {
                        if (paths[i] && paths[i] !== '') {
                            resolvedPath = paths[i] + (resolvedPath ? '/' + resolvedPath : '');
                            if (paths[i].startsWith('/')) break;
                        }
                    }
                    return resolvedPath || './';
                },
                normalize: (path) => {
                    return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
                }
            };
        }
    }

    /**
     * Browser-specific file operations using File System Access API
     */

    /**
     * Download file in browser
     * @param {string} fileName 
     * @param {string} data 
     * @param {string} mimeType 
     */
    downloadFile(fileName, data, mimeType = 'application/octet-stream') {
        if (!this.isBrowser) {
            throw new Error('Download only available in browser');
        }
        
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Prompt user to select file in browser
     * @param {Object} options 
     * @returns {Promise<File>}
     */
    async selectFile(options = {}) {
        if (!this.isBrowser) {
            throw new Error('File selection only available in browser');
        }
        
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = options.accept || '*/*';
            input.multiple = options.multiple || false;
            
            input.onchange = (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    resolve(options.multiple ? Array.from(files) : files[0]);
                } else {
                    reject(new Error('No file selected'));
                }
            };
            
            input.click();
        });
    }

    /**
     * Read file content in browser
     * @param {File} file 
     * @param {string} readAs 
     * @returns {Promise<string|ArrayBuffer>}
     */
    async readFileInBrowser(file, readAs = 'text') {
        if (!this.isBrowser) {
            throw new Error('Browser file reading only available in browser');
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            
            switch (readAs) {
                case 'text':
                    reader.readAsText(file);
                    break;
                case 'dataURL':
                    reader.readAsDataURL(file);
                    break;
                case 'arrayBuffer':
                    reader.readAsArrayBuffer(file);
                    break;
                default:
                    reader.readAsText(file);
            }
        });
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileManager;
} else if (typeof define === 'function' && define.amd) {
    define([], () => FileManager);
} else if (typeof window !== 'undefined') {
    window.FileManager = FileManager;
}
