import { Stake } from './staking/app';

export function wrap(staking: Stake, content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
</head>
<body>
${content}
</body>
</html>`;
}
