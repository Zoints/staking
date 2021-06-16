import { Keypair } from '@solana/web3.js';
import { seededKey } from './util';

export class AppCommunity {
    id: number;
    key: Keypair;
    authority: Keypair;
    primaryAuthority: Keypair;
    secondaryAuthority: Keypair;

    constructor(id: number, seed: Buffer) {
        this.id = id;

        this.key = seededKey(`community-${id}`, seed);
        this.authority = seededKey(`community-${id}-authority`, seed);
        this.primaryAuthority = seededKey(`community-${id}-primary`, seed);
        this.secondaryAuthority = seededKey(`community-${id}-secondary`, seed);
    }
}
