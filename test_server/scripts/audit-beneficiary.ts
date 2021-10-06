import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';
import { Beneficiary, PRECISION, Staking } from '@zoints/staking';
import BN from 'bn.js';

const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const staking = new Staking(
    new PublicKey('7vo1tfi7A7DfLi5viwb1eNwv9WUuphV2QS3TNv1nPUo5'),
    connection
);

const me = new PublicKey('2t8kgQCBm1h4fPCgqLTUF8rXmfKRnva7UVtMrdDnMSka');

function calculateReward(beneficiary: Beneficiary, newRewardPerShare: BN): BN {
    const mul = beneficiary.staked.mul(newRewardPerShare);

    console.log('Step 1:', mul.toString());

    const step2 = mul.div(PRECISION);
    console.log('Step 2:', step2.toString());

    const step3 = step2.sub(beneficiary.rewardDebt);
    console.log('Step 3:', step3.toString());

    return beneficiary.staked
        .mul(newRewardPerShare)
        .div(PRECISION)
        .sub(beneficiary.rewardDebt);
}

(async () => {
    const settings = await staking.getSettings();
    const beneficiary = await staking.getBeneficiary(me);

    const rps = settings.calculateRewardPerShare(new Date());
    console.log('Old RPS:', settings.rewardPerShare.toString());

    console.log('Reward per Share:', rps.toString());
    console.log('Holding:', beneficiary.holding.toString());
    console.log('Reward Debt:', beneficiary.rewardDebt.toString());
    console.log('Staked:', beneficiary.staked.toString());
    console.log('Harvestable:', beneficiary.calculateReward(rps).toString());
    console.log(
        'Own harvestable:',
        calculateReward(beneficiary, rps).toString()
    );
})().then(() => process.exit(0));
