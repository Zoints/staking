import { Keypair, PublicKey } from '@solana/web3.js';
import { Authority } from '@zoints/staking';
import { App } from './app';

export interface StakeEngine {
    registerEndpoint(
        app: App,
        key: Keypair,
        owner: Authority,
        primary: PublicKey,
        secondary: PublicKey
    ): Promise<void>;
    claim(
        app: App,
        authority: Keypair,
        communities?: PublicKey[]
    ): Promise<void>;
    stake(
        app: App,
        endpoint: PublicKey,
        staker: Keypair,
        amount: bigint
    ): Promise<void>;
    withdraw(
        app: App,
        staker: Keypair,
        communities: PublicKey[]
    ): Promise<void>;
    transfer(
        app: App,
        endpoint: PublicKey,
        owner: PublicKey,
        ownerSigner: Keypair,
        recipient: Authority
    ): Promise<void>;
    changeBeneficiaries(
        app: App,
        endpoint: PublicKey,
        owner: PublicKey,
        ownerSigner: Keypair,
        oldPrimary: PublicKey,
        oldSecondary: PublicKey,
        newPrimary: PublicKey,
        newSecondary: PublicKey
    ): Promise<void>;
}
