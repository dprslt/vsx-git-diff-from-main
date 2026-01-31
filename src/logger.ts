import * as vscode from 'vscode';

/**
 * Logger utility for Git Diff Sidebar extension
 */
export class Logger {
  private static outputChannel: vscode.OutputChannel;

  static initialize(channelName: string): void {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
  }

  static log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    this.outputChannel.appendLine(logMessage);
    console.log(logMessage);
  }

  static error(message: string, error?: any): void {
    const timestamp = new Date().toLocaleTimeString();
    const errorMessage = error ? `${message}: ${error}` : message;
    const logMessage = `[${timestamp}] ERROR: ${errorMessage}`;
    this.outputChannel.appendLine(logMessage);
    console.error(logMessage);

    if (error && error.stack) {
      this.outputChannel.appendLine(error.stack);
      console.error(error.stack);
    }
  }

  static show(): void {
    this.outputChannel.show();
  }

  static dispose(): void {
    this.outputChannel.dispose();
  }
}
