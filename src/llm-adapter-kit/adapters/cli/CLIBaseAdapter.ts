/**
 * Base adapter for CLI-backed providers (Claude Code, Codex, custom commands).
 * Spawns a local binary and exchanges the prompt over stdin/stdout, so these
 * providers use the user's existing subscription login instead of an API key.
 * Desktop only: requires Node's child_process, which Obsidian mobile lacks.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BaseAdapter } from '../BaseAdapter';
import { LLMProviderError, CostDetails } from '../types';

export interface CLIAdapterConfig {
  binaryPath?: string;
  extraArgs?: string[];
  commandTemplate?: string;
  timeoutMs?: number;
}

export interface CLIRunResult {
  stdout: string;
  stderr: string;
  code: number;
}

const COMMON_BIN_DIRS = [
  path.join(os.homedir(), '.local', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin'
];

export abstract class CLIBaseAdapter extends BaseAdapter {
  protected cliConfig: CLIAdapterConfig;

  /** Binary name to search for when no explicit path is configured */
  protected abstract readonly defaultBinaryName: string;
  /** Extra absolute locations to try beyond PATH-style directories */
  protected extraBinaryLocations: string[] = [];

  constructor(defaultModel: string, cliConfig?: CLIAdapterConfig) {
    super('CLI_PROVIDER_NO_KEY', defaultModel);
    this.cliConfig = cliConfig || {};
    this.initializeCache();
  }

  protected validateConfiguration(): void {
    // CLI providers authenticate through the tool's own login, not an API key.
  }

  async isAvailable(): Promise<boolean> {
    if (typeof spawn !== 'function') return false; // mobile / sandboxed
    return this.resolveBinary() !== null;
  }

  async getModelPricing(): Promise<CostDetails | null> {
    return null; // subscription-billed; real cost may come from CLI output
  }

  /**
   * Find the executable: explicit setting first, then common install dirs,
   * then any adapter-specific locations (e.g. app bundles).
   */
  protected resolveBinary(): string | null {
    const configured = this.cliConfig.binaryPath?.trim();
    if (configured) {
      if (configured.includes(path.sep)) {
        return fs.existsSync(configured) ? configured : null;
      }
      return this.searchDirs(configured);
    }
    return this.searchDirs(this.defaultBinaryName)
      || this.extraBinaryLocations.find(p => fs.existsSync(p))
      || null;
  }

  private searchDirs(binaryName: string): string | null {
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of [...pathDirs, ...COMMON_BIN_DIRS]) {
      if (!dir) continue;
      const candidate = path.join(dir, binaryName);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  protected buildEnv(binary: string): NodeJS.ProcessEnv {
    const dirs = [path.dirname(binary), ...COMMON_BIN_DIRS, process.env.PATH || ''];
    return { ...process.env, PATH: dirs.filter(Boolean).join(path.delimiter) };
  }

  /**
   * Run the binary, writing the prompt to stdin. Rejects on timeout,
   * spawn failure, or non-zero exit.
   */
  protected runCommand(args: string[], stdinInput: string): Promise<CLIRunResult> {
    const binary = this.resolveBinary();
    if (!binary) {
      throw new LLMProviderError(
        `Could not find the "${this.cliConfig.binaryPath || this.defaultBinaryName}" executable. Set its full path in the plugin settings.`,
        this.name,
        'BINARY_NOT_FOUND'
      );
    }

    const timeoutMs = this.cliConfig.timeoutMs || 180000;

    return new Promise<CLIRunResult>((resolve, reject) => {
      const child = spawn(binary, args, {
        cwd: os.homedir(),
        env: this.buildEnv(binary),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new LLMProviderError(
          `${this.name} timed out after ${Math.round(timeoutMs / 1000)}s`,
          this.name,
          'TIMEOUT'
        ));
      }, timeoutMs);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new LLMProviderError(
          `Failed to launch ${binary}: ${err.message}`,
          this.name,
          'SPAWN_ERROR',
          err
        ));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          reject(new LLMProviderError(
            `${this.name} exited with code ${code}: ${(stderr || stdout).slice(0, 500)}`,
            this.name,
            'CLI_ERROR'
          ));
        } else {
          resolve({ stdout, stderr, code: code ?? 0 });
        }
      });

      child.stdin.on('error', () => { /* EPIPE if the process died early; close handler reports it */ });
      child.stdin.write(stdinInput);
      child.stdin.end();
    });
  }
}
