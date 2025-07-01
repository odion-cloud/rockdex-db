/**
 * Cross-platform Security Manager with ES6 imports
 * Handles encryption, hashing, and security operations for both Node.js and Browser environments
 * @version 1.0.0
 * @author https://github.com/odion-cloud
 */

class SecurityManager {
    constructor() {
        this.isNode = typeof window === 'undefined' && typeof global !== 'undefined';
        this.isBrowser = typeof window !== 'undefined';
        this._nodeModules = null;
        this._initialized = false;
    }

    /**
     * Initialize the security manager
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
            const crypto = await import('crypto');
            
            this._nodeModules = {
                crypto: crypto.default || crypto
            };
        } catch (error) {
            // Fallback to require for older Node.js versions
            this._nodeModules = {
                crypto: require('crypto')
            };
        }
        
        return this._nodeModules;
    }

    /**
     * Generate secure random bytes
     * @param {number} size 
     * @returns {Promise<Uint8Array>}
     */
    async generateRandomBytes(size = 32) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            const buffer = modules.crypto.randomBytes(size);
            return new Uint8Array(buffer);
        } else {
            // Browser crypto API
            const array = new Uint8Array(size);
            window.crypto.getRandomValues(array);
            return array;
        }
    }

    /**
     * Generate secure ID
     * @param {number} length 
     * @returns {Promise<string>}
     */
    async generateSecureId(length = 16) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            const timestamp = Date.now().toString(36);
            const randomBytes = modules.crypto.randomBytes(16);
            const combined = `${timestamp}-${randomBytes.toString('hex')}`;
            return modules.crypto.createHash('sha256').update(combined).digest('hex').substr(0, length);
        } else {
            // Browser implementation
            const array = new Uint8Array(16);
            window.crypto.getRandomValues(array);
            const timestamp = Date.now().toString(36);
            const randomHex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
            return `${timestamp}-${randomHex}`.substring(0, length);
        }
    }

    /**
     * Generate UUID v4
     * @returns {Promise<string>}
     */
    async generateUUID() {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            return modules.crypto.randomUUID();
        } else {
            // Browser implementation
            if (window.crypto && window.crypto.randomUUID) {
                return window.crypto.randomUUID();
            } else {
                // Fallback UUID v4 generation
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
        }
    }

    /**
     * Create hash
     * @param {string} data 
     * @param {string} algorithm 
     * @returns {Promise<string>}
     */
    async hash(data, algorithm = 'sha256') {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            return modules.crypto.createHash(algorithm).update(data).digest('hex');
        } else {
            // Browser implementation using Web Crypto API
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);
            
            let algorithmName;
            switch (algorithm) {
                case 'sha1':
                    algorithmName = 'SHA-1';
                    break;
                case 'sha256':
                    algorithmName = 'SHA-256';
                    break;
                case 'sha384':
                    algorithmName = 'SHA-384';
                    break;
                case 'sha512':
                    algorithmName = 'SHA-512';
                    break;
                default:
                    algorithmName = 'SHA-256';
            }
            
            const hashBuffer = await window.crypto.subtle.digest(algorithmName, dataBuffer);
            const hashArray = new Uint8Array(hashBuffer);
            return Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');
        }
    }

    /**
     * Create HMAC
     * @param {string} data 
     * @param {string} key 
     * @param {string} algorithm 
     * @returns {Promise<string>}
     */
    async hmac(data, key, algorithm = 'sha256') {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            return modules.crypto.createHmac(algorithm, key).update(data).digest('hex');
        } else {
            // Browser implementation using Web Crypto API
            const encoder = new TextEncoder();
            const keyBuffer = encoder.encode(key);
            const dataBuffer = encoder.encode(data);
            
            let algorithmName;
            switch (algorithm) {
                case 'sha1':
                    algorithmName = 'SHA-1';
                    break;
                case 'sha256':
                    algorithmName = 'SHA-256';
                    break;
                case 'sha384':
                    algorithmName = 'SHA-384';
                    break;
                case 'sha512':
                    algorithmName = 'SHA-512';
                    break;
                default:
                    algorithmName = 'SHA-256';
            }
            
            const cryptoKey = await window.crypto.subtle.importKey(
                'raw',
                keyBuffer,
                { name: 'HMAC', hash: algorithmName },
                false,
                ['sign']
            );
            
            const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
            const signatureArray = new Uint8Array(signature);
            return Array.from(signatureArray, byte => byte.toString(16).padStart(2, '0')).join('');
        }
    }

    /**
     * Encrypt data using AES-256-GCM
     * @param {string} data 
     * @param {string} password 
     * @returns {Promise<string>}
     */
    async encrypt(data, password) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            // Derive key from password
            const salt = modules.crypto.randomBytes(16);
            const key = modules.crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
            
            // Generate IV
            const iv = modules.crypto.randomBytes(12);
            
            // Encrypt
            const cipher = modules.crypto.createCipherGCM('aes-256-gcm', key, iv);
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();
            
            // Combine salt, iv, authTag, and encrypted data
            const result = {
                salt: salt.toString('hex'),
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                encrypted
            };
            
            return Buffer.from(JSON.stringify(result)).toString('base64');
        } else {
            // Browser implementation using Web Crypto API
            const encoder = new TextEncoder();
            
            // Generate salt and derive key
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(password),
                { name: 'PBKDF2' },
                false,
                ['deriveKey']
            );
            
            const key = await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt']
            );
            
            // Generate IV
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            
            // Encrypt
            const encrypted = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encoder.encode(data)
            );
            
            // Combine salt, iv, and encrypted data
            const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
            result.set(salt, 0);
            result.set(iv, salt.length);
            result.set(new Uint8Array(encrypted), salt.length + iv.length);
            
            return btoa(String.fromCharCode(...result));
        }
    }

    /**
     * Decrypt data using AES-256-GCM
     * @param {string} encryptedData 
     * @param {string} password 
     * @returns {Promise<string>}
     */
    async decrypt(encryptedData, password) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            try {
                // Parse the encrypted data
                const data = JSON.parse(Buffer.from(encryptedData, 'base64').toString());
                const salt = Buffer.from(data.salt, 'hex');
                const iv = Buffer.from(data.iv, 'hex');
                const authTag = Buffer.from(data.authTag, 'hex');
                const encrypted = data.encrypted;
                
                // Derive key from password
                const key = modules.crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
                
                // Decrypt
                const decipher = modules.crypto.createDecipherGCM('aes-256-gcm', key, iv);
                decipher.setAuthTag(authTag);
                let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                
                return decrypted;
            } catch (error) {
                throw new Error('Failed to decrypt data: Invalid password or corrupted data');
            }
        } else {
            // Browser implementation using Web Crypto API
            try {
                const decoder = new TextDecoder();
                
                // Decode base64
                const binaryString = atob(encryptedData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Extract salt, iv, and encrypted data
                const salt = bytes.slice(0, 16);
                const iv = bytes.slice(16, 28);
                const encrypted = bytes.slice(28);
                
                // Derive key from password
                const encoder = new TextEncoder();
                const keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(password),
                    { name: 'PBKDF2' },
                    false,
                    ['deriveKey']
                );
                
                const key = await window.crypto.subtle.deriveKey(
                    {
                        name: 'PBKDF2',
                        salt: salt,
                        iterations: 100000,
                        hash: 'SHA-256'
                    },
                    keyMaterial,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['decrypt']
                );
                
                // Decrypt
                const decrypted = await window.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    encrypted
                );
                
                return decoder.decode(decrypted);
            } catch (error) {
                throw new Error('Failed to decrypt data: Invalid password or corrupted data');
            }
        }
    }

    /**
     * Generate password hash with salt
     * @param {string} password 
     * @param {number} rounds 
     * @returns {Promise<string>}
     */
    async hashPassword(password, rounds = 12) {
        await this.init();
        
        if (this.isNode) {
            const modules = await this._initNodeModules();
            
            // Generate salt
            const salt = modules.crypto.randomBytes(16);
            
            // Hash password with PBKDF2
            const hash = modules.crypto.pbkdf2Sync(password, salt, Math.pow(2, rounds), 64, 'sha256');
            
            return `${rounds}:${salt.toString('hex')}:${hash.toString('hex')}`;
        } else {
            // Browser implementation
            const encoder = new TextEncoder();
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(password),
                { name: 'PBKDF2' },
                false,
                ['deriveBits']
            );
            
            const hash = await window.crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: Math.pow(2, rounds),
                    hash: 'SHA-256'
                },
                keyMaterial,
                512 // 64 bytes
            );
            
            const hashArray = new Uint8Array(hash);
            const saltHex = Array.from(salt, byte => byte.toString(16).padStart(2, '0')).join('');
            const hashHex = Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');
            
            return `${rounds}:${saltHex}:${hashHex}`;
        }
    }

    /**
     * Verify password against hash
     * @param {string} password 
     * @param {string} hashedPassword 
     * @returns {Promise<boolean>}
     */
    async verifyPassword(password, hashedPassword) {
        await this.init();
        
        try {
            const [rounds, saltHex, hashHex] = hashedPassword.split(':');
            
            if (this.isNode) {
                const modules = await this._initNodeModules();
                const salt = Buffer.from(saltHex, 'hex');
                const hash = modules.crypto.pbkdf2Sync(password, salt, Math.pow(2, parseInt(rounds)), 64, 'sha256');
                return hash.toString('hex') === hashHex;
            } else {
                const encoder = new TextEncoder();
                const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                
                const keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(password),
                    { name: 'PBKDF2' },
                    false,
                    ['deriveBits']
                );
                
                const hash = await window.crypto.subtle.deriveBits(
                    {
                        name: 'PBKDF2',
                        salt: salt,
                        iterations: Math.pow(2, parseInt(rounds)),
                        hash: 'SHA-256'
                    },
                    keyMaterial,
                    512 // 64 bytes
                );
                
                const hashArray = new Uint8Array(hash);
                const computedHashHex = Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');
                
                return computedHashHex === hashHex;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Generate cryptographically secure random string
     * @param {number} length 
     * @param {string} charset 
     * @returns {Promise<string>}
     */
    async generateRandomString(length = 32, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        const randomBytes = await this.generateRandomBytes(length);
        let result = '';
        
        for (let i = 0; i < length; i++) {
            result += charset.charAt(randomBytes[i] % charset.length);
        }
        
        return result;
    }

    /**
     * Constant-time string comparison
     * @param {string} a 
     * @param {string} b 
     * @returns {boolean}
     */
    constantTimeCompare(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        
        return result === 0;
    }

    /**
     * Check if crypto functionality is available
     * @returns {Object}
     */
    getCryptoCapabilities() {
        return {
            environment: this.isNode ? 'node' : 'browser',
            randomBytes: true,
            hash: true,
            hmac: true,
            encrypt: true,
            decrypt: true,
            passwordHashing: true,
            webCryptoSupported: this.isBrowser && window.crypto && window.crypto.subtle,
            nodeCryptoSupported: this.isNode
        };
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SecurityManager;
} else if (typeof define === 'function' && define.amd) {
    define([], () => SecurityManager);
} else if (typeof window !== 'undefined') {
    window.SecurityManager = SecurityManager;
}
