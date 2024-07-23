"use client";

import React, { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram, ConfirmOptions, TransactionSignature, Keypair } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import idl from "./idl/game.json";

require("@solana/wallet-adapter-react-ui/styles.css");

const programID = new PublicKey("EpwFSsE5z58Tc9MrUa16868pkUG43uAXY6edjyJw35bq");

export default function Home() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [roomPubkey, setRoomPubkey] = useState(null);

  const getProgram = () => {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const provider = new anchor.AnchorProvider(connection, wallet, {});
    const program = new anchor.Program(idl, programID, provider);
    return program;
  };

  const createRoom = async () => {
    try {
      const program = getProgram();
  
      // Use current timestamp as a unique identifier
      const currentTimestamp = new anchor.BN(Date.now());
  
      const [roomPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("room"),
          wallet.publicKey.toBuffer(),
          currentTimestamp.toArrayLike(Buffer, 'le', 8)
        ],
        program.programId
      );
  
      console.log("Room PDA:", roomPDA.toString());
      console.log("Creator:", wallet.publicKey.toString());
      console.log("Timestamp:", currentTimestamp.toString());
  
      const tx = await program.methods.createRoom()
        .accounts({
          room: roomPDA,
          creator: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
  
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
  
      console.log("Transaction object:", tx);
  
      const signature = await wallet.sendTransaction(tx, connection);
      console.log("Transaction sent, signature:", signature);
  
      const confirmation = await connection.confirmTransaction({
        blockhash,
        lastValidBlockHeight,
        signature
      });
      console.log("Confirmation result:", confirmation);
  
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
      }
  
      console.log("Transaction confirmed");
      setRoomPubkey(roomPDA.toString());
    } catch (error) {
      console.error("Error in createRoom:", error);
      if (error.logs) console.error("Program logs:", error.logs);
    }
  }
  
  return (
    <div className="container">
      <h1>Solana Game Frontend</h1>
      <WalletMultiButton />
      {wallet.publicKey && (
        <button onClick={createRoom} style={{ marginTop: "20px" }}>
          Create Room
        </button>
      )}
      {roomPubkey && <p>Room created with address: {roomPubkey}</p>}
    </div>
  );
}
