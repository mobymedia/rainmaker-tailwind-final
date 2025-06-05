// app/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { ethers } from "ethers";
import { CloudRain, Upload, Wallet, Zap } from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import toast, { Toaster } from "react-hot-toast";
import { motion } from "framer-motion";
import Papa from "papaparse";

const ABI = [
  "function disperseEther(address[] recipients, uint256[] values) external payable",
  "function disperseToken(address token, address[] recipients, uint256[] values) external"
];

const CONTRACTS: Record<number, string> = {
  56: "0x41c57d044087b1834379CdFE1E09b18698eC3A5A",
  42161: "0x06b9d57Ba635616F41E85D611b2DA58856176Fa9",
  137: "0xD375BA042B41A61e36198eAd6666BC0330649403"
};

export default function Rainmaker() {
  const [inputText, setInputText] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    const history = localStorage.getItem("rainmaker-history");
    if (history) setInputText(history);
  }, []);

  useEffect(() => {
    localStorage.setItem("rainmaker-history", inputText);
  }, [inputText]);

  const handleCSVUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (results) => {
        const lines = results.data;
        const formatted = lines.map(row => row.join(",")).join("\n");
        setInputText(formatted);
        toast.success("CSV uploaded successfully");
      },
      error: () => toast.error("CSV parsing failed")
    });
  };

  const handleSend = async () => {
    if (!window.ethereum) return toast.error("No wallet found");

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();

    try {
      const network = await provider.getNetwork();
      const chainId = network.chainId;

      if (!CONTRACTS[chainId]) return toast.error("Unsupported network");

      const contract = new ethers.Contract(CONTRACTS[chainId], ABI, signer);

      const lines = inputText.trim().split("\n");
      const recipients = [];
      const amounts = [];
      let total = ethers.BigNumber.from(0);

      for (const line of lines) {
        const [addr, amount] = line.split(",").map(s => s.trim());
        if (!ethers.utils.isAddress(addr)) throw new Error(`Invalid address: ${addr}`);
        const parsed = ethers.utils.parseUnits(amount, 18);
        recipients.push(addr);
        amounts.push(parsed);
        total = total.add(parsed);
      }

      let tx;

      if (tokenAddress && ethers.utils.isAddress(tokenAddress)) {
        tx = await contract.disperseToken(tokenAddress, recipients, amounts);
      } else {
        tx = await contract.disperseEther(recipients, amounts, { value: total });
      }

      toast.success("Transaction sent: " + tx.hash);
      await tx.wait();
      toast.success("Transaction confirmed ✅");
    } catch (err) {
      toast.error(err.message || "Transaction failed");
    }
  };

  return (
    <>
      <Head>
        <title>Rainmaker – Multisend</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Toaster position="bottom-right" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen bg-gradient-to-br from-gray-950 to-blue-900 text-white p-6 md:p-12"
      >
        <div className="max-w-3xl mx-auto bg-white/10 backdrop-blur-md rounded-3xl p-10 shadow-2xl border border-white/20">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-extrabold flex items-center gap-3">
              <CloudRain className="w-9 h-9" /> Rainmaker
            </h1>
            <span className="text-xs bg-green-500 text-white px-3 py-1 rounded-full uppercase tracking-wide">
              Multichain
            </span>
          </div>

          <div className="mb-6">
            <label className="text-sm mb-2 block font-semibold">Wallets & Amounts</label>
            <textarea
              className="w-full h-44 p-4 text-sm rounded-xl bg-gray-800 text-white"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="0xabc123...,0.1\n0xdef456...,0.25"
            />
          </div>

          <div className="mb-6">
            <label className="text-sm mb-2 block font-semibold">Token Address (optional)</label>
            <input
              type="text"
              placeholder="Leave empty to send native token (ETH, MATIC, BNB...)"
              className="w-full p-3 text-sm rounded-md bg-gray-700"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-4 items-center mb-6">
            <button
              onClick={handleSend}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-6 py-2.5 rounded-xl text-sm font-semibold"
            >
              <Zap className="w-4 h-4" /> Send
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-2.5 rounded-xl text-sm font-semibold"
            >
              <Upload className="w-4 h-4" /> Upload CSV
            </button>
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="hidden"
              ref={fileInputRef}
            />
          </div>

          <p className="text-xs text-white/60">
            Paste wallet addresses and amounts above in the format: <br />
            <code>0xabc...,0.1</code>
          </p>
        </div>
      </motion.div>
    </>
  );
}
