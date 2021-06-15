import { Stake } from './staking/app';

export async function wrap(staking: Stake, content: string): Promise<string> {
    const settings = await staking.staking.getSettings();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
<style type="text/css">
<!--
* {
    font-family: monospace;
}

.row {
    display: flex;
}
-->
</style>
</head>
<body>
<div class="row">
<div style="flex: 0 0 25em">
<a href="/reload">RELOAD SYSTEM</a>
<table>
    <tr>
        <td>Total Stake</td>
        <td>${settings.totalStake.toNumber()}</td>
    </tr>
    <tr>
        <td>Last Reward</td>
        <td>${settings.lastReward
            .toISOString()
            .replace(/T/, ' ')
            .replace(/\..+/, '')}</td>
    </tr>
</table>
</div>
<div>${content}</div>
</div>
</body>
</html>`;
}
