import { PRECISION, Staking } from '@zoints/staking';
import { Stake } from './staking/app';

function pretty(d: Date): string {
    return d.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

export async function viewSettings(staking: Stake): Promise<string> {
    if (!staking.loaded) {
        return 'loading BPF and initializing contract in progress';
    }

    return `<a href="/reloadBPF"> RELOAD BPF </a><br><a href="/reload"> RESET SYSTEM & RELOAD BPF </a>`;
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

    const assocPrimary = await staking.token.getOrCreateAssociatedAccountInfo(
        community.primary.authority
    );

    let secondary = '';
    if (community.secondary.isEmpty()) {
        secondary = `        <tr>
            <td>Authority</td>
            <td>None</td>
        </tr>
        <tr>
            <td>ZEE Address</td>
            <td>N/A</td>
        </tr>
        <tr>
            <td>ZEE Balance</td>
            <td>N/A</td>

        </tr>
        <tr>
            <td>Staked</td>
            <td>${community.secondary.staked.toString()}</td>
        </tr>
        <tr>
            <td>Reward Debt</td>
            <td>${community.secondary.rewardDebt.toString()}</td>
        </tr>
        <tr>
            <td>Pending Reward</td>
            <td>${community.secondary.pendingReward.toString()}</td>
        </tr>
        <tr>
            <td>Harvestable</td>
            <td>${community.secondary.calculateReward(rps).toString()}</td>
        </tr>`;
    } else {
        const assocSecondary =
            await staking.token.getOrCreateAssociatedAccountInfo(
                community.secondary.authority
            );

        secondary = `        <tr>
            <td>Authority</td>
            <td><a href="https://explorer.solana.com/address/${assocSecondary.address.toBase58()}?customUrl=${
            staking.connectionURL
        }&cluster=custom">${assocSecondary.address.toBase58()}</a></td>
        </tr>
        <tr>
            <td>ZEE Address</td>
            <td><a href="https://explorer.solana.com/address/${community.secondary.authority.toBase58()}?customUrl=${
            staking.connectionURL
        }&cluster=custom">${community.secondary.authority.toBase58()}</td>
        </tr>
        <tr>
            <td>ZEE Balance</td>
            <td>${assocSecondary.amount.toString()}</td>

        </tr>
        <tr>
            <td>Staked</td>
            <td>${community.secondary.staked.toString()}</td>
        </tr>
        <tr>
            <td>Reward Debt</td>
            <td>${community.secondary.rewardDebt.toString()}</td>
        </tr>
        <tr>
            <td>Pending Reward</td>
            <td>${community.secondary.pendingReward.toString()}</td>
        </tr>
        <tr>
            <td>Harvestable</td>
            <td>${community.secondary
                .calculateReward(rps)
                .toString()} (<a href="/claim/${
            appComm.id
        }/secondary">Claim</a>)</td>
        </tr>`;
    }

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
            <td>ZEE Address</td>
            <td><a href="https://explorer.solana.com/address/${assocPrimary.address.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${assocPrimary.address.toBase58()}</a></td>
        </tr>
        <tr>
            <td>ZEE Balance</td>
            <td>${assocPrimary.amount}</td>

        </tr>
        <tr>
            <td>Staked</td>
            <td>${community.primary.staked.toString()}</td>
        </tr>
        <tr>
            <td>Reward Debt</td>
            <td>${community.primary.rewardDebt.toString()}</td>
        </tr>
        <tr>
            <td>Pending Reward</td>
            <td>${community.primary.pendingReward.toString()}</td>
        </tr>
        <tr>
            <td>Harvestable</td>
            <td>${community.primary
                .calculateReward(rps)
                .toString()} (<a href="/claim/${
        appComm.id
    }/primary">Claim</a>)</td>
        </tr>
        <tr>
            <td colspan="2"><br><b>Secondary</b></td>
        </tr>
        ${secondary}
    </table>`;
}

export async function viewStaker(staking: Stake, id: number): Promise<string> {
    if (!staking.loaded) {
        return 'loading BPF and initializing contract in progress';
    }

    const appStaker = staking.stakers[id];
    const settings = await staking.staking.getSettings();
    const assoc = await staking.token.getOrCreateAssociatedAccountInfo(
        appStaker.key.publicKey
    );

    const rps = settings.calculateRewardPerShare(new Date());

    let community_list = '';
    for (let community of staking.communities) {
        community_list += `<h3>${community.id} - ${community.key.publicKey
            .toBase58()
            .substr(0, 8)}</h3><table>`;
        try {
            const stakerId = await Staking.stakeAddress(
                staking.program_id,
                community.key.publicKey,
                appStaker.key.publicKey
            );
            const stakeAccount = await staking.staking.getStakeWithoutId(
                community.key.publicKey,
                appStaker.key.publicKey
            );

            let unbonding = '';
            const now = Math.floor(new Date().getTime() / 1000);
            const expired =
                Math.floor(stakeAccount.unbondingStart.getTime() / 1000) +
                settings.unbondingTime.toNumber();

            if (now <= expired) {
                let remain = expired - now;
                const ub_days = Math.floor(remain / 86400);
                remain -= ub_days * 86400;

                if (ub_days > 0) {
                    unbonding += `${ub_days} days `;
                }

                const ub_hours = Math.floor(remain / 3600);
                if (ub_hours > 0) {
                    unbonding += `${ub_hours} hours `;
                }

                remain -= ub_hours * 3600;
                if (remain > 0) {
                    unbonding += `${remain} seconds `;
                }
                unbonding += `left`;
            } else if (stakeAccount.unbondingAmount.isZero()) {
                unbonding = `Nothing to withdraw.`;
            } else {
                unbonding = `<a href="/withdraw/${community.id}/${appStaker.id}">Ready to Withdraw</a>`;
            }

            community_list += `
                <tr>
                    <td>Stake ID</td>
                    <td>${stakerId.toBase58()}</td>
                </tr>
                <tr>
                    <td>Created</td>
                    <td>${pretty(stakeAccount.creationDate)}</td>
                </tr>
                <tr>
                    <td>Total Stake</td>
                    <td>${stakeAccount.totalStake.toString()}</td>
                </tr>
                
                <tr>
                    <td>Unbonding Amount</td>
                    <td>${stakeAccount.unbondingAmount.toString()}</td>
                </tr>
                <tr>
                    <td>Unbonding Start</td>
                    <td>${pretty(stakeAccount.unbondingStart)}</td>
                </tr>
                <tr>
                    <td>Withdraw Unbond</td>
                    <td>${unbonding}</td>
                </tr>                <tr>
                    <td>Authority</td>
                    <td><a href="https://explorer.solana.com/address/${stakeAccount.beneficiary.authority.toBase58()}?customUrl=${
                staking.connectionURL
            }&cluster=custom">${stakeAccount.beneficiary.authority.toBase58()}</td>
                </tr>
                <tr>
                    <td>Staked</td>
                    <td>${stakeAccount.beneficiary.staked.toString()}</td>
                </tr>
                <tr>
                    <td>Reward Debt</td>
                    <td>${stakeAccount.beneficiary.rewardDebt.toString()}</td>
                </tr>
                <tr>
                    <td>Pending Reward</td>
                    <td>${stakeAccount.beneficiary.pendingReward.toString()}</td>
                </tr>
                <tr>
                    <td>Harvestable</td>
                    <td>${stakeAccount.beneficiary
                        .calculateReward(rps)
                        .toString()}</td>
                </tr>
            `;
        } catch (e: any) {
            community_list += `<tr><td colspan="2">No stake found</td></tr>`;
            //console.log(e);
        }
        community_list += `<tr><td>
            <form action="/stake/${community.id}/${appStaker.id}" method="POST"><input type="text" name="amount" placeholder="0"><input type="submit" value="Stake"></form>
            </td></tr></table>`;
    }

    let communities = `<h2>Communities</h2>${community_list}`;

    return `<table>
        <tr>
            <td>ID</td>
            <td>${id}</td>
        </td>
        <tr>
            <td>Public Key</td>
            <td><a href="https://explorer.solana.com/address/${appStaker.key.publicKey.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${appStaker.key.publicKey.toBase58()}</a></td>
        </tr>

        <tr>
            <td>ZEE Address</td>
            <td><a href="https://explorer.solana.com/address/${assoc.address.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${assoc.address.toBase58()}</a></td>
        </tr>
        <tr>
            <td>ZEE Balance</td>
            <td>${assoc.amount}</td>

        </tr>
        <tr><td></td><td><form action="/airdrop/${
            appStaker.id
        }" method="GET"><input type="text" name="amount" placeholder="0"><input type="submit" value="Airdrop Zee"></form></td></tr>
    </table> ${communities}`;
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
    const communities = `<ol>${community_list}</ol> <a href="/addCommunity">Add Community</a><br><a href="/addCommunity?nosec=true">Add Community (No Secondary)</a>`;

    let stakers_list = '';
    for (let staker of staking.stakers) {
        stakers_list += `<li><a href="/staker/${
            staker.id
        }"> ${staker.key.publicKey.toBase58().substr(0, 8)}</a></li>`;
    }
    const stakers = `<ol>${stakers_list}</ol> <a href="/addStaker">Add Staker</a>`;

    const stakePoolId = await Staking.stakePoolId(staking.program_id);
    const stakePool = await staking.token.getAccountInfo(stakePoolId);

    const rewardPoolId = await Staking.rewardPoolId(staking.program_id);
    const rewardPool = await staking.token.getAccountInfo(rewardPoolId);

    let unbonding = '';
    const ub_days = Math.floor(settings.unbondingTime.toNumber() / 86400);
    let remain = settings.unbondingTime.toNumber() - ub_days * 86400;

    if (ub_days > 0) {
        unbonding += `${ub_days} days `;
    }

    const ub_hours = Math.floor(remain / 3600);
    if (ub_hours > 0) {
        unbonding += `${ub_hours} hours `;
    }

    remain = remain - ub_hours * 3600;
    if (remain > 0) {
        unbonding += `${remain} seconds`;
    }

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
        <td>${settings.totalStake.toString()}</td>
    </tr>
    <tr>
        <td>Last Reward</td>
        <td>${pretty(settings.lastReward)}</td>
    </tr>
    <tr>
        <td>Stake Pool Balance</td>
        <td>${stakePool.amount.toString()}</td>
    </tr>
    <tr>
        <td>Reward Pool Balance</td>
        <td>${rewardPool.amount.toString()}</td>
    </tr>
    <tr>
        <td>Unbonding Time</td>
        <td>${unbonding}</td>
    </tr>
    <tr>
        <td>Emission</td>
        <td>${settings.emission.toString()}</td>
    </tr>
    <tr>
        <td>Next Emission Change</td>
        <td>${pretty(settings.nextEmissionChange)}</td>
    </tr>
    <tr>
        <td>Reward Per Share</td>
        <td>${settings.rewardPerShare.div(PRECISION).toString()}</td>
    </tr>
</table>
<h2>Communities</h2>
${communities}

<h2>Stakers</h2>
${stakers}
</div>
<div>${content}</div>
</div>
</body>
</html>`;
}
