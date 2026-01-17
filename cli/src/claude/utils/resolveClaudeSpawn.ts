import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { logger } from '@/ui/logger';

export type ClaudeSpawnPlan = {
    command: string;
    args: string[];
    shell: boolean;
};

const CMD_EXTENSIONS = new Set(['.cmd', '.bat']);

export function resolveClaudeSpawn(pathToClaudeCodeExecutable: string, args: string[]): ClaudeSpawnPlan {
    if (process.platform !== 'win32') {
        return { command: pathToClaudeCodeExecutable, args, shell: false };
    }

    const executable = pathToClaudeCodeExecutable;
    const ext = path.extname(executable).toLowerCase();

    if (ext === '.js') {
        return {
            command: resolveNodeCommand(),
            args: [executable, ...args],
            shell: false
        };
    }

    if (CMD_EXTENSIONS.has(ext)) {
        const scriptPath = resolveClaudeScriptFromCmd(executable);
        if (scriptPath) {
            return {
                command: resolveNodeCommand(),
                args: [scriptPath, ...args],
                shell: false
            };
        }
        return { command: executable, args, shell: true };
    }

    if (executable === 'claude') {
        const cmdPath = findClaudeCmdPath();
        if (cmdPath) {
            const scriptPath = resolveClaudeScriptFromCmd(cmdPath);
            if (scriptPath) {
                return {
                    command: resolveNodeCommand(),
                    args: [scriptPath, ...args],
                    shell: false
                };
            }
        }
        return { command: executable, args, shell: true };
    }

    return { command: executable, args, shell: false };
}

function resolveNodeCommand(): string {
    if (/node(?:\.exe)?$/i.test(process.execPath)) {
        return process.execPath;
    }
    return 'node';
}

function findClaudeCmdPath(): string | null {
    const homeDir = homedir();
    try {
        const output = execSync('where claude', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: homeDir
        }).trim();
        if (!output) {
            return null;
        }
        const candidates = output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        if (candidates.length === 0) {
            return null;
        }
        const cmdCandidate = candidates.find((candidate) => {
            const lower = candidate.toLowerCase();
            return lower.endsWith('.cmd') || lower.endsWith('.bat');
        });
        return cmdCandidate ?? candidates[0];
    } catch {
        return null;
    }
}

function resolveClaudeScriptFromCmd(cmdPath: string): string | null {
    if (!existsSync(cmdPath)) {
        return null;
    }
    let content: string;
    try {
        content = readFileSync(cmdPath, 'utf8');
    } catch {
        return null;
    }
    const matches = Array.from(content.matchAll(/"([^"]+\\.js)"/gi)).map((match) => match[1]);
    if (matches.length === 0) {
        return null;
    }
    const candidate = matches.find((match) => match.toLowerCase().includes('claude')) ?? matches[0];
    const expanded = expandCmdPath(candidate, path.dirname(cmdPath));
    const resolved = path.resolve(expanded);
    if (!existsSync(resolved)) {
        return null;
    }
    logger.debug(`[Claude Spawn] Resolved Claude entrypoint: ${resolved}`);
    return resolved;
}

function expandCmdPath(value: string, cmdDir: string): string {
    return value.replace(/%~dp0/gi, cmdDir + path.sep);
}
