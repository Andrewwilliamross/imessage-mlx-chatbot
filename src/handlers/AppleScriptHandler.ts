import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AppleScript execution result
 */
export interface AppleScriptResult {
    success: boolean;
    data?: unknown;
    error?: string;
    operation?: string;
}

/**
 * Process spawn result
 */
interface SpawnResult {
    stdout: string;
    stderr: string;
}

class AppleScriptHandler {
    private scriptPath: string;

    constructor() {
        this.scriptPath = path.join(__dirname, '../applescript/imessage.applescript');
    }

    async executeOperation(operation: string, params: Record<string, unknown> = {}): Promise<AppleScriptResult> {
        try {
            // Build arguments array for osascript
            const args: string[] = [this.scriptPath, `operation=${operation}`];

            // Add parameters as command line arguments
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    args.push(`${key}=${value}`);
                }
            });

            logger.debug(`Executing AppleScript: ${operation}`, { args });

            const result = await this._spawnProcess('osascript', args);

            const output = result.stdout.trim();
            const error = result.stderr?.trim();

            if (error) {
                logger.warn(`AppleScript stderr for ${operation}:`, { error });
            }

            logger.debug(`AppleScript output for ${operation}:`, { output });

            return this.parseResult(output);

        } catch (error) {
            const err = error as Error;
            logger.error(`AppleScript execution failed for ${operation}:`, { error: err.message, stack: err.stack });
            return {
                success: false,
                error: err.message,
                operation
            };
        }
    }

    /**
     * Spawn a process and return stdout/stderr as a promise
     */
    private _spawnProcess(command: string, args: string[]): Promise<SpawnResult> {
        return new Promise((resolve, reject) => {
            const child: ChildProcess = spawn(command, args, {
                shell: false,
                timeout: 30000
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            child.on('error', (error: Error) => {
                reject(error);
            });

            child.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(new Error(`Process exited with code ${code}: ${stderr}`));
                }
            });
        });
    }

    parseResult(output: string): AppleScriptResult {
        if (output.startsWith('Success: ')) {
            const data = output.substring(9); // Remove "Success: "

            // Try to parse JSON data
            if (data.startsWith('[') || data.startsWith('{')) {
                try {
                    return {
                        success: true,
                        data: JSON.parse(data)
                    };
                } catch (parseError) {
                    const err = parseError as Error;
                    logger.warn('Failed to parse AppleScript JSON output:', { error: err.message });
                    return {
                        success: true,
                        data: data
                    };
                }
            }

            return {
                success: true,
                data: data
            };
        } else if (output.startsWith('Error: ')) {
            return {
                success: false,
                error: output.substring(7) // Remove "Error: "
            };
        } else {
            // Unexpected format
            return {
                success: false,
                error: `Unexpected AppleScript output: ${output}`
            };
        }
    }

    // Convenience methods for specific operations
    async sendTextMessage(recipient: string, text: string): Promise<AppleScriptResult> {
        return this.executeOperation('send_text', {
            recipient,
            message: text
        });
    }

    async sendMediaMessage(recipient: string, text: string, filePath: string): Promise<AppleScriptResult> {
        return this.executeOperation('send_media', {
            recipient,
            message: text,
            file: filePath
        });
    }

    async sendSMSMessage(recipient: string, text: string): Promise<AppleScriptResult> {
        return this.executeOperation('send_sms', {
            recipient,
            message: text
        });
    }

    async sendMMSMessage(recipient: string, text: string, filePath: string): Promise<AppleScriptResult> {
        return this.executeOperation('send_mms', {
            recipient,
            message: text,
            file: filePath
        });
    }

    async getConversations(limit: number = 50): Promise<AppleScriptResult> {
        return this.executeOperation('get_conversations', {
            conversationLimit: limit
        });
    }

    async getConversationMessages(chatIdentifier: string, limit: number = 100): Promise<AppleScriptResult> {
        return this.executeOperation('get_conversation', {
            recipient: chatIdentifier,
            messageLimit: limit
        });
    }

    async exportConversation(chatIdentifier: string, exportPath: string, format: string = 'json', limit: number = 1000): Promise<AppleScriptResult> {
        return this.executeOperation('export_conversation', {
            recipient: chatIdentifier,
            exportPath,
            exportFormat: format,
            messageLimit: limit
        });
    }

    async testAccess(): Promise<AppleScriptResult> {
        return this.executeOperation('test_access');
    }
}

export default AppleScriptHandler;
