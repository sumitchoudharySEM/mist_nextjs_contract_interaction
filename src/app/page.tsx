'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Commitment, ConfirmOptions, Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, web3, utils } from '@project-serum/anchor';
import { Idl } from '@project-serum/anchor';
import idl from './game.json';



// Rest of the code...
import { Buffer } from 'buffer';

const PROGRAM_ID = new PublicKey('EpwFSsE5z58Tc9MrUa16868pkUG43uAXY6edjyJw35bq');
const NETWORK = 'https://api.devnet.solana.com';

export default function Home() {
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const [roomId, setRoomId] = useState('');
  const [winnerPublicKey, setWinnerPublicKey] = useState('');
  const [program, setProgram] = useState<Program | null>(null);

  useEffect(() => {
    if (!publicKey || !signTransaction) return;

    const connection = new Connection(NETWORK, 'confirmed');
    const wallet = {
      publicKey,
      signTransaction,
      signAllTransactions: async (txs: Transaction[]) => {
        return Promise.all(txs.map(tx => signTransaction(tx)));
      },
    };

    const opts: ConfirmOptions = {
      preflightCommitment: 'processed' as Commitment,
    };
    
    const provider = new AnchorProvider(connection, wallet, opts);

    const program = new Program(idl, PROGRAM_ID, provider);
    setProgram(program);
  }, [publicKey, signTransaction]);

  const createRoom = async () => {
    if (!program || !publicKey) return;

    try {
      const [roomPda] = await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("room"), publicKey.toBuffer()],
        PROGRAM_ID
      );

      await program.methods.createRoom().accounts({
        room: roomPda,
        creator: publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc();

      console.log('Room created:', roomPda.toBase58());
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const joinRoom = async () => {
    if (!program || !publicKey || !roomId) return;

    try {
      const roomPubkey = new PublicKey(roomId);

      await program.methods.joinRoom().accounts({
        room: roomPubkey,
        player: publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc();

      console.log('Joined room:', roomPubkey.toBase58());
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const endGame = async () => {
    if (!program || !publicKey || !roomId || !winnerPublicKey) return;

    try {
      const roomPubkey = new PublicKey(roomId);
      const winnerPubkey = new PublicKey(winnerPublicKey);

      await program.methods.endGame(winnerPubkey).accounts({
        room: roomPubkey,
        deployer: publicKey,
        systemProgram: SystemProgram.programId,
      }).rpc();

      console.log('Game ended. Winner:', winnerPubkey.toBase58());
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <h1>Solana Game Frontend</h1>
      <WalletMultiButton />
      {publicKey && (
        <div>
          <button onClick={createRoom}>Create Room</button>
          <div>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Room ID"
            />
            <button onClick={joinRoom}>Join Room</button>
          </div>
          <div>
            <input
              type="text"
              value={winnerPublicKey}
              onChange={(e) => setWinnerPublicKey(e.target.value)}
              placeholder="Winner Public Key"
            />
            <button onClick={endGame}>End Game</button>
          </div>
        </div>
      )}
    </div>
  );
}
