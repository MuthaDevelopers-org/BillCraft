/**
 * A small headless Chrome driver over the DevTools protocol, built only on Node
 * (Node 22 and later have WebSocket). Used by the browser tests (tests/e2e) and
 * scripts/make-icons.mjs. Set CHROME_PATH to use a Chrome or Chromium elsewhere.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The path of an installed Chrome or Chromium, or null */
export function findChrome() {
  return CANDIDATES.find(candidate => existsSync(candidate)) || null;
}

/**
 * Starts headless Chrome with a fresh profile and connects to its first page.
 * Returns { send, evaluate, events, issues, dialogs, close }:
 * - send(method, params) calls a DevTools protocol method
 * - evaluate(expression) runs JavaScript in the page and returns the value
 * - events: listeners called with every protocol event
 * - issues: console errors, warnings and uncaught exceptions seen so far
 * - dialogs: messages of alert/confirm/prompt dialogs (accepted automatically)
 */
export async function launchChrome({ port = 9222 + Math.floor(Math.random() * 700) } = {}) {
  const executable = findChrome();
  if (!executable) throw new Error('Chrome was not found. Set CHROME_PATH to its executable.');
  const profile = mkdtempSync(path.join(tmpdir(), 'billcraft-chrome-'));
  const chrome = spawn(executable, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--mute-audio',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let attempt = 0; attempt < 100 && !targets; attempt++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    } catch {
      await sleep(150);
    }
  }
  if (!targets) {
    chrome.kill('SIGKILL');
    throw new Error('Chrome did not start');
  }
  const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let nextId = 1;
  const pending = new Map();
  const events = [];
  const issues = [];
  const dialogs = [];

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      issues.push(`exception: ${details.exception?.description || details.text}`);
    }
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(message.params.type)) {
      issues.push(`${message.params.type}: ${message.params.args.map(arg => arg.value ?? arg.description).join(' ')}`);
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      issues.push(`log: ${message.params.entry.text} ${message.params.entry.url || ''}`.trim());
    }
    if (message.method === 'Page.javascriptDialogOpening') {
      dialogs.push(message.params.message);
      send('Page.handleJavaScriptDialog', { accept: true });
    }
    events.forEach(listener => listener(message));
  };

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  const close = async () => {
    socket.close();
    chrome.kill('SIGTERM');
    await sleep(400);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };

  return { send, evaluate, events, issues, dialogs, close };
}
