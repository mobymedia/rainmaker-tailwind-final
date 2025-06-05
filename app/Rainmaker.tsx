// Rainmaker.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { ethers } from "ethers";
import { CloudRain, Upload, Wallet, Zap } from "lucide-react";
import Head from "next/head";
import toast, { Toaster } from "react-hot-toast";
import { motion } from "framer-motion";
import Papa from "papaparse";

const ABI = [
  "function disperseEther(address[] recipients, uint256[] values) external payable",
  "function disperseToken(address token, address[] recipients, uint256[] values) external"
];

const CONTRACTS: Record<number, string> = {
  1: "0xYourEthereumMainnetAddress",
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

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (results) => {
        const lines = results.data as string[][];
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
      const recipients: string[] = [];
      const amounts: ethers.BigNumber[] = [];
      let total = ethers.BigNumber.from(0);

      for (const line of lines) {
        const [addr, amount] = line.split(",").map(s => s.trim());
        if (!ethers.utils.isAddress(addr)) throw new Error(`Invalid address: ${addr}`);
        const parsed = ethers.utils.parseUnits(amount, 18);
        recipients.push(addr);
        amounts.push(parsed);
        total = total.add(parsed);
      }

      if (!ethers.utils.isAddress(tokenAddress)) {
        return toast.error("Valid token address is required");
      }

      const tx = await contract.disperseToken(tokenAddress, recipients, amounts);
      toast.success("Transaction sent: " + tx.hash);
      await tx.wait();
      toast.success("Transaction confirmed ✅");
    } catch (err: any) {
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
        className="min-h-screen bg-gradient-to-br from-[#0f0f0f] to-[#1a1a2e] text-white p-6 md:p-12 font-sans"
      >
        <div className="max-w-4xl mx-auto rounded-2xl bg-[#1c1c2c] shadow-xl border border-gray-700 overflow-hidden">
          <div className="bg-[#10101a] p-6 md:p-8 border-b border-gray-700">
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
              <CloudRain className="w-7 h-7 md:w-9 md:h-9 text-blue-400" /> Rainmaker
            </h1>
            <p className="text-sm text-gray-400 mt-2">Bulk token distribution made easy – now with multichain support.</p>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300">Wallets & Amounts</label>
              <textarea
                className="w-full h-48 p-4 text-sm rounded-lg bg-[#2a2a3d] text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="0xabc123...,0.1\n0xdef456...,0.25"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300">Token Address <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="Enter token contract address (required)"
                className="w-full p-3 text-sm rounded-md bg-[#2a2a3d] text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-4 items-center">
              <button
                onClick={handleSend}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-6 py-2.5 rounded-lg text-sm font-semibold shadow-md transition-all"
              >
                <Zap className="w-4 h-4" /> Send
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-2.5 rounded-lg text-sm font-semibold shadow-md transition-all"
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

            <p className="text-xs text-gray-500">
              Paste wallet addresses and amounts above in the format: <br />
              <code>0xabc...,0.1</code>
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
}
