import { PRECISION } from '../js/src';
import { Stake } from './staking/app';

function pretty(d: Date): string {
    return d.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

export async function viewSettings(staking: Stake): Promise<string> {
    if (!staking.loaded) {
        return 'loading BPF and initializing contract in progress';
    }

    return `<a href="/reload"> RESET SYSTEM & RELOAD BPF </a>`;
}

export async function viewCommunity(
    staking: Stake,
    id: number
): Promise<string> {
    if (!staking.loaded) {
        return 'loading BPF and initializing contract in progress';
    }

    const appComm = staking.communities[id];
    const community = await staking.staking.getCommunity(appComm.key.publicKey);
    const settings = await staking.staking.getSettings();

    const rps = settings.calculateRewardPerShare(new Date());

    return `<table>
        <tr>
            <td>ID</td>
            <td>${id}</td>
        </td>
        <tr>
            <td>Public Key</td>
            <td><a href="https://explorer.solana.com/address/${appComm.key.publicKey.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${appComm.key.publicKey.toBase58()}</a></td>
        </tr>
        <tr>
            <td>Authority</td>
            <td><a href="https://explorer.solana.com/address/${
                community.authority
            }?customUrl=${staking.connectionURL}&cluster=custom">${
        community.authority
    }</a></td>
        </tr>
        <tr>
            <td>Creation Date</td>
            <td>${pretty(community.creationDate)}</td>
        </tr>
        <tr>
            <td colspan="2"><br><b>Primary</b></td>
        </tr>
        <tr>
            <td>Authority</td>
            <td><a href="https://explorer.solana.com/address/${community.primary.authority.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${community.primary.authority.toBase58()}</td>
        </tr>
        <tr>
            <td>Staked</td>
            <td>${community.primary.staked.toNumber()}</td>
        </tr>
        <tr>
            <td>Reward Debt</td>
            <td>${community.primary.rewardDebt.toNumber()}</td>
        </tr>
        <tr>
            <td>Pending Reward</td>
            <td>${community.primary.pendingReward.toNumber()}</td>
        </tr>
        <tr>
            <td>Harvestable</td>
            <td>${community.primary.calculateReward(rps).toNumber()}</td>
        </tr>
        <tr>
            <td colspan="2"><br><b>Secondary</b></td>
        </tr>
        <tr>
            <td>Authority</td>
            <td><a href="https://explorer.solana.com/address/${community.secondary.authority.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${community.secondary.authority.toBase58()}</td>
        </tr>
        <tr>
            <td>Staked</td>
            <td>${community.secondary.staked.toNumber()}</td>
        </tr>
        <tr>
            <td>Reward Debt</td>
            <td>${community.secondary.rewardDebt.toNumber()}</td>
        </tr>
        <tr>
            <td>Pending Reward</td>
            <td>${community.secondary.pendingReward.toNumber()}</td>
        </tr>
        <tr>
            <td>Harvestable</td>
            <td>${community.secondary.calculateReward(rps).toNumber()}</td>
        </tr>
        <tr>
            <td></td>
            <td></td>
        </tr>
    </table>`;
}

export async function wrap(staking: Stake, content: string): Promise<string> {
    if (!staking.loaded) {
        return 'loading BPF and initializing contract in progress';
    }

    const settings = await staking.staking.getSettings();
    const recent = await staking.connection.getRecentBlockhashAndContext();

    let community_list = '';
    for (let community of staking.communities) {
        community_list += `<li><a href="/community/${
            community.id
        }"> ${community.key.publicKey.toBase58().substr(0, 8)}</a></li>`;
    }
    const communities = `<ol>${community_list}</ol> <a href="/addCommunity">Add Community</a>`;

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
<a href="/settings">Settings</a>
<table>
    <tr><td>Slot</td><td>${recent.context.slot}</td></tr>
    <tr>
        <td>Total Stake</td>
        <td>${settings.totalStake.toNumber()}</td>
    </tr>
    <tr>
        <td>Last Reward</td>
        <td>${pretty(settings.lastReward)}</td>
    </tr>
</table>
<h2>Communities</h2>
${communities}
</div>
<div>${content}</div>
</div>
</body>
</html>`;
}
