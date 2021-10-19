import {
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    Transaction
} from '@solana/web3.js';
import { Instruction, Authority, AuthorityType } from '@zoints/staking';
import { App } from './app';
import { StakeEngine } from './engine';

export class EngineDirect implements StakeEngine {
    async registerEndpoint(
        app: App,
        key: Keypair,
        primary: Authority,
        secondary: Authority
    ): Promise<void> {
        const transaction = new Transaction().add(
            await Instruction.RegisterEndpoint(
                app.program_id,
                app.funder.publicKey,
                key.publicKey,
                primary,
                secondary
            )
        );

        const sig = await sendAndConfirmTransaction(
            app.connection,
            transaction,
            [app.funder, key]
        );

        console.log(`Added community ${key.publicKey.toBase58()}: ${sig}`);
    }

    async claim(app: App, authority: Keypair): Promise<void> {
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            authority.publicKey
        );
        const trans = new Transaction().add(
            await Instruction.Claim(
                app.program_id,
                app.funder.publicKey,
                authority.publicKey,
                assoc.address
            )
        );
        const sig = await sendAndConfirmTransaction(app.connection, trans, [
            app.funder,
            authority
        ]);

        console.log(
            `Claimed Harvest ${authority.publicKey.toBase58()}: ${sig}`
        );
    }

    async stake(
        app: App,
        endpoint: PublicKey,
        staker: Keypair,
        amount: bigint
    ): Promise<void> {
        const assoc = await app.token.getOrCreateAssociatedAccountInfo(
            staker.publicKey
        );
        const trans = new Transaction();

        try {
            await app.staking.getStakeWithoutId(endpoint, staker.publicKey);
        } catch (e) {
            trans.add(
                await Instruction.InitializeStake(
                    app.program_id,
                    app.funder.publicKey,
                    staker.publicKey,
                    endpoint,
                    app.mint_id.publicKey
                )
            );
        }

        const ep = await app.staking.getEndpoint(endpoint);

        trans.add(
            await Instruction.Stake(
                app.program_id,
                app.funder.publicKey,
                staker.publicKey,
                assoc.address,
                endpoint,
                ep.primary,
                ep.secondary,
                amount
            )
        );
        const sig = await sendAndConfirmTransaction(app.connection, trans, [
            app.funder,
            staker
        ]);

        console.log(`Staked: ${sig}`);
    }

    async withdraw(
        app: App,
        staker: Keypair,
        endpoints: PublicKey[]
    ): Promise<void> {
        for (const endpoint of endpoints) {
            const assoc = await app.token.getOrCreateAssociatedAccountInfo(
                staker.publicKey
            );
            const trans = new Transaction();
            trans.add(
                await Instruction.WithdrawUnbond(
                    app.program_id,
                    app.funder.publicKey,
                    staker.publicKey,
                    assoc.address,
                    endpoint
                )
            );
            const sig = await sendAndConfirmTransaction(app.connection, trans, [
                app.funder,
                staker
            ]);

            console.log(`Withdraw Unbond ${endpoint.toBase58()}: ${sig}`);
        }
    }
}
