import { Authority, AuthorityType, PRECISION, Staking } from '@zoints/staking';
import { App } from './staking/app';

function pretty(d: Date): string {
    return d.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

export async function viewEndpoint(staking: App, id: number): Promise<string> {
    if (!staking.loaded) {
        return 'loading BPF and initializing contract in progress';
    }

    const pubkey = staking.endpoints[id].publicKey;
    const endpoint = await staking.staking.getEndpoint(pubkey);
    const settings = await staking.staking.getSettings();

    const rps = settings.calculateRewardPerShare(new Date());

    const primary = await staking.staking.getBeneficiary(endpoint.primary);
    const secondary = await staking.staking.getBeneficiary(endpoint.secondary);

    let secondaryText = '';
    if (secondary.isEmpty()) {
        secondaryText = `        <tr>
            <td>Authority</td>
            <td>None</td>
        </tr>
        <tr>
            <td>Staked</td>
            <td>${secondary.staked.toString()}</td>
        </tr>
        <tr>
            <td>Reward Debt</td>
            <td>${secondary.rewardDebt.toString()}</td>
        </tr>
        <tr>
            <td>Holding</td>
            <td>${secondary.holding.toString()}</td>
        </tr>
        <tr>
            <td>Harvestable</td>
            <td>${secondary.calculateReward(rps).toString()}</td>
        </tr>`;
    } else {
        secondaryText = `        <tr>
            <td>Authority</td>
            <td><a href="https://explorer.solana.com/address/${secondary.authority.toBase58()}?customUrl=${
            staking.connectionURL
        }&cluster=custom">${secondary.authority.toBase58()}</a></td>
        </tr>
        <tr>
            <td>Staked</td>
            <td>${secondary.staked.toString()}</td>
        </tr>
        <tr>
            <td>Reward Debt</td>
            <td>${secondary.rewardDebt.toString()}</td>
        </tr>
        <tr>
            <td>Holding</td>
            <td>${secondary.holding.toString()}</td>
        </tr>
        <tr>
            <td>Harvestable</td>
            <td>${secondary.calculateReward(rps).toString()}</td>
        </tr>        <tr>
            <td>Combined</td>
            <td>${secondary
                .calculateReward(rps)
                .add(secondary.holding)
                .toString()}</td>
        </tr>`;
    }

    return `<table>
        <tr>
            <td>ID</td>
            <td>${id}</td>
        </td>
        <tr>
            <td>Public Key</td>
            <td><a href="https://explorer.solana.com/address/${pubkey.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${pubkey.toBase58()}</a></td>
        </tr>
        <tr>
            <td>Creation Date</td>
            <td>${pretty(endpoint.creationDate)}</td>
        </tr>
        <tr>
            <td>Total Stake</td>
            <td>${endpoint.totalStake.toString()}</td>
        </tr>
        <tr>
            <td colspan="2"><br><b>Owner</b></td>
        </tr>
        <tr>
            <td>Type</td>
            <td>${AuthorityType[endpoint.owner.authorityType]}</td>
        </tr>
        <tr>
            <td>Authority</td>
            <td><a href="https://explorer.solana.com/address/${endpoint.owner.address.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${endpoint.owner.address.toBase58()}</a></td>
        </tr>
        <tr>
            <td colspan="2"><br><b>Primary</b></td>
        </tr>
        <tr>
            <td>Authority</td>
            <td><a href="https://explorer.solana.com/address/${primary.authority.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${primary.authority.toBase58()}</a></td>
        </tr>
        <tr>
            <td>Staked</td>
            <td>${primary.staked.toString()}</td>
        </tr>
        <tr>
            <td>Reward Debt</td>
            <td>${primary.rewardDebt.toString()}</td>
        </tr>
        <tr>
            <td>Holding</td>
            <td>${primary.holding.toString()}</td>
        </tr>
        <tr>
            <td>Harvestable</td>
            <td>${primary.calculateReward(rps).toString()}</td>
        </tr>
        <tr>
            <td>Combined</td>
            <td>${primary
                .calculateReward(rps)
                .add(primary.holding)
                .toString()}</td>
        </tr>
        <tr>
            <td colspan="2"><br><b>Secondary</b></td>
        </tr>
        ${secondaryText}
    </table>`;
}

export async function viewWallet(staking: App, id: number): Promise<string> {
    if (!staking.loaded) {
        return 'loading BPF and initializing contract in progress';
    }

    const wallet = staking.wallets[id].publicKey;
    const settings = await staking.staking.getSettings();
    const assoc = await staking.token.getOrCreateAssociatedAccountInfo(wallet);
    const rps = settings.calculateRewardPerShare(new Date());

    let beneficiary_data = '';
    try {
        const beneficiary = await staking.staking.getBeneficiary(wallet);
        beneficiary_data = `
        <h1>Beneficiary</h1>
        <a href="/claim/${id}">Claim All</a><br>
        <table>
        <tr>
            <td></td>
            <td><a href="https://explorer.solana.com/address/${beneficiary.authority.toBase58()}?customUrl=${
            staking.connectionURL
        }&cluster=custom">${beneficiary.authority.toBase58()}</td>
                </tr>
                <tr>
                    <td>Staked</td>
                    <td>${beneficiary.staked.toString()}</td>
                </tr>
                <tr>
                    <td>Reward Debt</td>
                    <td>${beneficiary.rewardDebt.toString()}</td>
                </tr>
                <tr>
                    <td>Holding</td>
                    <td>${beneficiary.holding.toString()}</td>
                </tr>
                <tr>
                    <td>Harvestable</td>
                    <td>${beneficiary.calculateReward(rps).toString()}</td>
                </tr>
        </table>`;
    } catch (e) {
        beneficiary_data = `<h2>Beneficiary</h2> Not created yet.`;
    }

    let endpoint_list = '';
    for (
        let endpointId = 0;
        endpointId < staking.endpoints.length;
        endpointId++
    ) {
        const endpoint = staking.endpoints[endpointId].publicKey;
        endpoint_list += `<h3>${endpointId} - ${endpoint
            .toBase58()
            .substr(0, 8)}</h3><table>`;
        try {
            const stakeId = await Staking.stakeAddress(
                staking.program_id,
                endpoint,
                wallet
            );
            const stakeAccount = await staking.staking.getStake(stakeId);

            const stakingFundId = await Staking.stakeFundAddress(
                endpoint,
                wallet,
                staking.program_id
            );
            const stakingFund = await staking.token.getAccountInfo(
                stakingFundId
            );

            let unbonding = '';
            const now = Math.floor(new Date().getTime() / 1000);
            const expired = Math.floor(
                stakeAccount.unbondingEnd.getTime() / 1000
            );

            if (now < expired) {
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
                unbonding = `<a href="/withdraw/${endpointId}/${id}">Ready to Withdraw</a>`;
            }

            endpoint_list += `
                <tr>
                    <td>Stake ID</td>
                    <td>${wallet.toBase58()}</td>
                </tr>
                <tr>
                    <td>Created</td>
                    <td>${pretty(stakeAccount.creationDate)}</td>
                </tr>
                <tr>
                    <td>Total Stake</td>
                    <td>${stakeAccount.totalStake.toString()}</td>
                </tr>

                <td>Staking Fund</td>
                    <td><a href="https://explorer.solana.com/address/${stakingFundId.toBase58()}?customUrl=${
                staking.connectionURL
            }&cluster=custom">${stakingFundId.toBase58()}</td>
                <tr>
                    <td>Staking Fund Balance</td>
                    <td>${stakingFund.amount.toString()}</td>
                </tr>
                
                <tr>
                    <td>Unbonding Amount</td>
                    <td>${stakeAccount.unbondingAmount.toString()}</td>
                </tr>
                <tr>
                    <td>Unbonding End</td>
                    <td>${pretty(stakeAccount.unbondingEnd)}</td>
                </tr>
                <tr>
                    <td>Withdraw Unbond</td>
                    <td>${unbonding}</td>
                </tr>                <tr>
            `;
        } catch (e: any) {
            endpoint_list += `<tr><td colspan="2">No stake found</td></tr></table>`;
            //console.log(e);
        }
        endpoint_list += `<tr><td>
            <form action="/stake/${endpointId}/${id}" method="POST"><input type="text" name="amount" placeholder="0"><input type="submit" value="Stake"></form>
            </td></tr></table>`;
    }

    let communities = `<h2>Communities</h2>${endpoint_list}`;

    return `<table>
        <tr>
            <td>ID</td>
            <td>${id}</td>
        </td>
        <tr>
            <td>Public Key</td>
            <td><a href="https://explorer.solana.com/address/${wallet.toBase58()}?customUrl=${
        staking.connectionURL
    }&cluster=custom">${wallet.toBase58()}</a></td>
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
        <tr><td></td><td><form action="/airdrop/${id}" method="GET"><input type="text" name="amount" placeholder="0"><input type="submit" value="Airdrop Zee"></form></td></tr>
    </table>
    ${beneficiary_data}
    ${communities}
    
    <h1>NFTs</h1>
    <a href="/addNFT/${id}">Mint an NFT for this address</a>
    `;
}

export async function wrap(staking: App, content: string): Promise<string> {
    if (!staking.loaded) {
        return 'loading BPF and initializing contract in progress';
    }

    const settings = await staking.staking.getSettings();
    const recent = await staking.connection.getRecentBlockhashAndContext();

    let endpoint_list = '';
    for (let id = 0; id < staking.endpoints.length; id++) {
        const endpoint = staking.endpoints[id].publicKey;
        endpoint_list += `<li><a href="/endpoint/${id}"> ${endpoint
            .toBase58()
            .substr(0, 8)}</a></li>`;
    }
    const endpoints = `<ol>${endpoint_list}</ol>`;

    let wallets_list = '';
    for (let id = 0; id < staking.wallets.length; id++) {
        const wallet = staking.wallets[id].publicKey;
        wallets_list += `<li><a href="/wallet/${id}"> ${wallet
            .toBase58()
            .substr(0, 8)}</a></li>`;
    }
    const wallets = `<ol>${wallets_list}</ol> <a href="/addWallet">Add Wallet</a>`;

    let nft_list = '';
    for (let id = 0; id < staking.nfts.length; id++) {
        const nft = staking.nfts[id].publicKey;
        nft_list += `<li><a href="/nft/${id}"> ${nft
            .toBase58()
            .substr(0, 8)}</a></li>`;
    }
    const nfts = `<ol>${nft_list}</ol>`;

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
    const rps = settings.calculateRewardPerShare(new Date());

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
    <tr>
        <td></td>
        <td></td>
    </tr>

</table>
<h2>Endpoints</h2>
${endpoints}

<h2>Wallets</h2>
${wallets}

<h2>NFTs</h2>
${nfts}
</div>
<div>${content}</div>
</div>
</body>
</html>`;
}
