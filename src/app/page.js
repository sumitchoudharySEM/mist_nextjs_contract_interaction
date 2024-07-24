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
  const [availableRooms, setAvailableRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState("");

  const fetchAvailableRooms = async () => {
    if (!isGlobalStateInitialized) return;
  
    setLoading(true);
    try {
      const program = getProgram();
      const globalState = await program.account.globalState.fetch(globalStatePDA);
      const totalRoomsCount = globalState.totalRooms.toNumber();
  
      const rooms = [];
      for (let i = 0; i < totalRoomsCount; i++) {
        const [roomPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("room"), new anchor.BN(i).toArrayLike(Buffer, "le", 8)],
          program.programId
        );

        console.log(`Fetching room ${i+1} at ${roomPDA.toString()}`);
  
        try {
          const roomAccount = await program.account.room.fetch(roomPDA);
          // if (roomAccount.state === 0) { // Assuming 0 is the 'Init' state in your enum
            rooms.push({ id: i+1, pubkey: roomPDA.toString() });
          // }
        } catch (err) {
          if (err.message.includes("Account does not exist")) {
            console.log(`Room ${i} does not exist, skipping.`);
          } else {
            console.error(`Error fetching room ${i}:`, err);
          }
        }
      }
  
      setAvailableRooms(rooms);
      console.log(`Found ${rooms.length} available rooms.`);
    } catch (err) {
      console.error("Error fetching available rooms:", err);
      setError("Failed to fetch available rooms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isGlobalStateInitialized) {
      fetchAvailableRooms();
    }
  }, [isGlobalStateInitialized]);

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

      console.log(`Creating room ${currentRoomId} at ${roomPDA}`);
      console.log(`Global state at ${globalStatePDA}`);
      console.log(`Creator wallet at ${wallet.publicKey}`);
      console.log(`System program at ${SystemProgram.programId}`);
  
      const tx = await program.methods
        .createRoom()
        .accounts({
          room: roomPDA,
          globalState: globalStatePDA,
          creator: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

        console.log("Room created. Transaction signature:", tx);
  
      console.log("Transaction signature:", tx);
      setRoomPubkey(roomPDA.toString());
      
      await fetchTotalRooms();
      await fetchAvailableRooms();
    } catch (err) {
      console.error("Error creating room:", err);
      setError(`Error creating room: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!wallet.publicKey) {
      setError("Please connect your wallet first.");
      return;
    }

    if (!selectedRoom) {
      setError("Please select a room to join.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const program = getProgram();
      
      const tx = await program.methods
        .joinRoom()
        .accounts({
          room: new PublicKey(selectedRoom),
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Joined room. Transaction signature:", tx);
      setRoomPubkey(selectedRoom);
      
      await fetchAvailableRooms(); // Refresh the room list
    } catch (err) {
      console.error("Error joining room:", err);
      setError(`Error joining room: ${err.message}`);
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
            <button onClick={fetchAvailableRooms} disabled={loading || !isGlobalStateInitialized}>
              Refresh Available Rooms
            </button>
            {totalRooms !== null && <p>Total Rooms Created: {totalRooms}</p>}
            {roomPubkey && <p>Room created/joined! PubKey: {roomPubkey}</p>}
          </div>
          
          <div>
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              disabled={loading || availableRooms.length === 0}
              className="select-room"
            >
              <option value="">Select a room to join</option>
              {availableRooms.map((room) => (
                <option key={room.id} value={room.pubkey}>
                  Room {room.id}, {room.pubkey}
                </option>
              ))}
            </select>
            <button onClick={joinRoom} disabled={loading || !selectedRoom}>
              Join Selected Room
            </button>
          </div>
          
          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}