import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';
import { Staking } from '@zoints/staking';

// Run a simple audit on the reward pool to see how much has been paid out so far.
// The reward pool balance should be somewhere between the initial balance and
// the the theoretical minimum balance.

const ONE_YEAR = 365 * 24 * 3600;
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const staking = new Staking(
    new PublicKey('7vo1tfi7A7DfLi5viwb1eNwv9WUuphV2QS3TNv1nPUo5'),
    connection
);

(async () => {
    const settings = await staking.getSettings();

    const launched = settings.nextEmissionChange.getUnixTime() - ONE_YEAR;
    const now = new Date().getUnixTime();
    const elapsed = now - launched;

    // only works in the first year
    console.log(
        `      Staking Launch: ${new Date(launched * 1000).toUTCString()}`
    );
    console.log(`            Time now: ${new Date().toUTCString()}`);
    console.log(`Seconds since launch: ${elapsed}`);
    console.log();
    console.log(`Emission per Year: ${settings.emission.toNumber()} ZEE`);
    console.log(
        `Emission per Second: ${settings.emission.toNumber() / ONE_YEAR} ZEE`
    );
    console.log();

    const maximum = settings.emission.muln(elapsed).divn(ONE_YEAR);

    const balance =
        (await connection.getTokenAccountBalance(await staking.rewardPoolId()))
            .value.uiAmount || 0;

    const initial = 3_600_000_000_000;

    console.log(`   Initial Reward Pool Balance: ${initial} ZEE`);
    console.log(`Current Balance of Reward Pool: ${balance} ZEE`);
    console.log(
        `   Theoretical Minimum Balance: ${initial - maximum.toNumber()} ZEE`
    );
    console.log();
    console.log(`       Maximum possible payout: ${maximum.toString()} ZEE`);
    console.log(`                 Actual payout: ${initial - balance} ZEE`);
})()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
