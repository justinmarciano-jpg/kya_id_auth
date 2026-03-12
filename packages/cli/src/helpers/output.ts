import readline from 'node:readline';

export function heading(text: string): void {
  console.log(`\n  \x1b[1m${text}\x1b[0m\n`);
}

export function field(label: string, value: string): void {
  console.log(`  \x1b[2m${label}:\x1b[0m ${value}`);
}

export function success(text: string): void {
  console.log(`\n  \x1b[32m✓\x1b[0m ${text}\n`);
}

export function error(text: string): void {
  console.error(`\n  \x1b[31m✗\x1b[0m ${text}\n`);
}

export function ask(rl: readline.Interface, question: string, defaultVal?: string): Promise<string> {
  const prompt = defaultVal ? `  ${question} (${defaultVal}): ` : `  ${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}
