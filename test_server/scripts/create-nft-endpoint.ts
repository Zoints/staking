import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    sendAndConfirmTransaction,
    Transaction
} from '@solana/web3.js';
import {
    Instruction,
    AuthorityType,
    Staking,
    Authority
} from '@zoints/staking';

const connection = new Connection('http://localhost:8899', 'confirmed');
const programId = new PublicKey('6K6MbwYzafYS7yLQenBkPCZwf4k8XWJxvTNzFryzJvro');
const staking = new Staking(programId, connection);
(async () => {
    const funder = new Keypair();
    await connection.confirmTransaction(
        await connection.requestAirdrop(funder.publicKey, LAMPORTS_PER_SOL * 5)
    );

    const mintAuthority = new Keypair();
    const owner = new Keypair();
    const token = await Token.createMint(
        connection,
        funder,
        mintAuthority.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID
    );
    const assoc = await token.getOrCreateAssociatedAccountInfo(owner.publicKey);

    await token.mintTo(assoc.address, mintAuthority, [], 1);
    await token.setAuthority(
        token.publicKey,
        null,
        'MintTokens',
        mintAuthority,
        []
    );

    const endpoint = new Keypair();
    const primary = new Keypair();

    const tx = new Transaction().add(
        await Instruction.RegisterEndpoint(
            programId,
            funder.publicKey,
            endpoint.publicKey,
            Authority.NFT(token.publicKey),
            primary.publicKey
        )
    );
    console.log(
        await sendAndConfirmTransaction(connection, tx, [funder, endpoint])
    );
})().then(() => process.exit(0));
