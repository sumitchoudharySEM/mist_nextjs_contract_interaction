"use client";

import React, { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import idl from "./idl/game.json"; // Make sure this path is correct

require("@solana/wallet-adapter-react-ui/styles.css");

const programID = new PublicKey("EpwFSsE5z58Tc9MrUa16868pkUG43uAXY6edjyJw35bq");

export default function Home() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [roomPubkey, setRoomPubkey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [globalStatePDA, setGlobalStatePDA] = useState(null);
  const [totalRooms, setTotalRooms] = useState(null);
  const [isGlobalStateInitialized, setIsGlobalStateInitialized] = useState(false);

  useEffect(() => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      programID
    );
    setGlobalStatePDA(pda);
  }, []);

  const getProgram = () => {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const provider = new anchor.AnchorProvider(connection, wallet, {});
    const program = new anchor.Program(idl, programID, provider);
    return program;
  };

  const checkGlobalStateInitialized = async () => {
    if (!globalStatePDA) return;

    try {
      const program = getProgram();
      const accountInfo = await connection.getAccountInfo(globalStatePDA);
      setIsGlobalStateInitialized(accountInfo !== null);
    } catch (err) {
      console.error("Error checking global state:", err);
    }
  };

  const fetchTotalRooms = async () => {
    if (!globalStatePDA || !isGlobalStateInitialized) return;

    try {
      const program = getProgram();
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      setTotalRooms(globalState.totalRooms.toString());
    } catch (err) {
      console.error("Error fetching total rooms:", err);
      setError("Failed to fetch total rooms");
    }
  };

  useEffect(() => {
    if (wallet.connected && globalStatePDA) {
      checkGlobalStateInitialized();
    }
  }, [wallet.connected, globalStatePDA]);

  useEffect(() => {
    if (isGlobalStateInitialized) {
      fetchTotalRooms();
    }
  }, [isGlobalStateInitialized]);

  const createRoom = async () => {
    if (!wallet.publicKey) {
      setError("Please connect your wallet first.");
      return;
    }

    if (!isGlobalStateInitialized) {
      setError("Please initialize the global state first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const program = getProgram();
      
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      const currentRoomId = globalState.totalRooms; // Use the current total_rooms without adding 1
  
      const [roomPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("room"),
          currentRoomId.toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
  
      const tx = await program.methods
        .createRoom()
        .accounts({
          room: roomPDA,
          globalState: globalStatePDA,
          creator: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
  
      console.log("Transaction signature:", tx);
      setRoomPubkey(roomPDA.toString());
      
      await fetchTotalRooms();
    } catch (err) {
      console.error("Error creating room:", err);
      setError(`Error creating room: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const initializeGlobalState = async () => {
    if (!wallet.publicKey) {
      setError("Please connect your wallet first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const program = getProgram();

      const tx = await program.methods
        .initialize()
        .accounts({
          globalState: globalStatePDA,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Global state initialized. Transaction signature:", tx);
      setIsGlobalStateInitialized(true);
      await fetchTotalRooms();
    } catch (err) {
      console.error("Error initializing global state:", err);
      setError(`Error initializing global state: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Solana Game Frontend</h1>
      <WalletMultiButton />
      {wallet.connected && (
        <div>
          {!isGlobalStateInitialized && (
            <div>
              <p>Global state is not initialized. You can initialize it below:</p>
              <button onClick={initializeGlobalState} disabled={loading}>
                Initialize Global State
              </button>
            </div>
          )}
          
          <div>
            <button onClick={createRoom} disabled={loading || !isGlobalStateInitialized}>
              {loading ? "Creating Room..." : "Create Room"}
            </button>
            <button onClick={fetchTotalRooms} disabled={loading || !isGlobalStateInitialized}>
              Refresh Total Rooms
            </button>
            {totalRooms !== null && <p>Total Rooms Created: {totalRooms}</p>}
            {roomPubkey && <p>Room created! PubKey: {roomPubkey}</p>}
          </div>
          
          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}