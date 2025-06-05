"use client";

import { useEffect, useState, useRef } from "react";
import { ethers } from "ethers";
import { CloudRain, Upload, Wallet, Zap, RefreshCw, LogOut } from "lucide-react";
import Head from "next/head";
import toast, { Toaster } from "react-hot-toast";
import { motion } from "framer-motion";
import Papa from "papaparse";

const ABI = [
  "function disperseEther(address[] recipients, uint256[] values) external payable",
  "function disperseToken(address token, address[] recipients, uint256[] values) external"
];

const CONTRACTS: Record<number, string> = {
  1: "0xD375BA042B41A61e36198eAd6666BC0330649403",
  56: "0x41c57d044087b1834379CdFE1E09b18698eC3A5A",
  42161: "0x06b9d57Ba635616F41E85D611b2DA58856176Fa9",
  137: "0xD375BA042B41A61e36198eAd6666BC0330649403"
};

const NETWORKS = {
  1: { name: "Ethereum", symbol: "ETH", rpc: "https://eth-mainnet.g.alchemy.com/v2/" },
  56: { name: "BNB Chain", symbol: "BNB", rpc: "https://bsc-dataseed.binance.org" },
  137: { name: "Polygon", symbol: "MATIC", rpc: "https://polygon-rpc.com" },
  42161: { name: "Arbitrum", symbol: "ETH", rpc: "https://arb1.arbitrum.io/rpc" }
};

const TOKEN_DECIMALS_MAP: Record<string, number> = {
  "0x55d398326f99059fF775485246999027B3197955": 18
};

export default function Rainmaker() {
  const [inputText, setInputText] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isNativeToken, setIsNativeToken] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const history = localStorage.getItem("rainmaker-history");
    if (history) setInputText(history);
    
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
      checkConnection();
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("rainmaker-history", inputText);
  }, [inputText]);

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      setAccount(null);
      toast.error("Please connect your wallet");
    } else {
      setAccount(accounts[0]);
    }
  };

  const handleChainChanged = (chainIdHex: string) => {
    const newChainId = parseInt(chainIdHex, 16);
    setChainId(newChainId);
    if (!CONTRACTS[newChainId]) {
      toast.error("Unsupported network");
    }
  };

  const checkConnection = async () => {
    if (!window.ethereum) return;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    try {
      const network = await provider.getNetwork();
      setChainId(network.chainId);
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        setAccount(accounts[0]);
      }
    } catch (err) {
      console.error("Failed to check connection:", err);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setChainId(null);
    toast.success("Wallet disconnected");
  };

  const switchNetwork = async (targetChainId: number) => {
    if (!window.ethereum) return toast.error("MetaMask not detected");
    
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
    } catch (error: any) {
      if (error.code === 4902) {
        toast.error("Please add this network to your wallet first");
      } else {
        toast.error("Failed to switch network");
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) return toast.error("MetaMask not detected");
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    try {
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      const network = await provider.getNetwork();
      setChainId(network.chainId);
      toast.success("Wallet connected");
    } catch (err) {
      toast.error("Failed to connect wallet");
    }
  };

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

  const validateInput = (lines: string[]) => {
    if (lines.length === 0) throw new Error("No recipients provided");
    
    for (const line of lines) {
      const parts = line.split(/[\s,]+/).map(s => s.trim());
      if (parts.length !== 2) throw new Error(`Invalid format in line: "${line}"`);
      if (!ethers.utils.isAddress(parts[0])) throw new Error(`Invalid address: ${parts[0]}`);
      if (isNaN(Number(parts[1])) || Number(parts[1]) <= 0) throw new Error(`Invalid amount in line: "${line}"`);
    }
  };

  const handleSend = async () => {
    if (!window.ethereum) return toast.error("No wallet found");
    if (!chainId || !CONTRACTS[chainId]) return toast.error("Please switch to a supported network");
    
    setIsPending(true);
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();

    try {
      const lines = inputText.trim().split("\n").filter(line => line.trim() !== "");
      validateInput(lines);

      const contractAddress = CONTRACTS[chainId];
      const contract = new ethers.Contract(contractAddress, ABI, signer);

      const recipients: string[] = [];
      const amounts: ethers.BigNumber[] = [];
      let total = ethers.BigNumber.from(0);

      if (!isNativeToken && !tokenAddress.trim()) {
        throw new Error("Token address is required for token transfers");
      }

      let decimals = 18; // Default for native tokens

      if (!isNativeToken) {
        const parsedTokenAddress = ethers.utils.getAddress(tokenAddress.trim());
        const tokenContract = new ethers.Contract(parsedTokenAddress, [
          "function decimals() view returns (uint8)",
          "function allowance(address owner, address spender) view returns (uint256)",
          "function approve(address spender, uint256 amount) returns (bool)"
        ], signer);

        try {
          decimals = await tokenContract.decimals();
        } catch {
          decimals = TOKEN_DECIMALS_MAP[parsedTokenAddress.toLowerCase()] || 18;
          toast("⚠️ Couldn't fetch token decimals — using fallback", { icon: "⚠️" });
        }
      }

      for (const line of lines) {
        const [addr, amount] = line.split(/[\s,]+/).map(s => s.trim());
        const parsed = ethers.utils.parseUnits(amount, decimals);
        recipients.push(addr);
        amounts.push(parsed);
        total = total.add(parsed);
      }

      if (isNativeToken) {
        const tx = await contract.disperseEther(recipients, amounts, { value: total });
        toast.success("Transaction sent: " + tx.hash);
        await tx.wait();
        toast.success("Transaction confirmed ✅");
      } else {
        const parsedTokenAddress = ethers.utils.getAddress(tokenAddress.trim());
        const tokenContract = new ethers.Contract(parsedTokenAddress, [
          "function allowance(address owner, address spender) view returns (uint256)",
          "function approve(address spender, uint256 amount) returns (bool)"
        ], signer);

        const userAddress = await signer.getAddress();
        const allowance = await tokenContract.allowance(userAddress, contractAddress);

        if (allowance.lt(total)) {
          toast("Approval required...", { icon: "🔐" });
          const approvalTx = await tokenContract.approve(contractAddress, total);
          toast.success("Approval tx sent: " + approvalTx.hash);
          await approvalTx.wait();
          toast.success("Token approved ✅");
        }

        const tx = await contract.disperseToken(parsedTokenAddress, recipients, amounts);
        toast.success("Transaction sent: " + tx.hash);
        await tx.wait();
        toast.success("Transaction confirmed ✅");
      }
    } catch (err: any) {
      toast.error(err.message || "Transaction failed");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <Head>
        <title>Rainmaker – Multisend</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Toaster position="bottom-right" />
      <div className="min-h-screen bg-[#0f0f0f] text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto rounded-2xl bg-[#1c1c2c] shadow-xl border border-gray-700 overflow-hidden">
          <div className="bg-[#10101a] p-6 md:p-8 border-b border-gray-700">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
                <CloudRain className="w-7 h-7 md:w-9 md:h-9 text-blue-400" /> Rainmaker
              </h1>
              <div className="flex items-center gap-3">
                {chainId && NETWORKS[chainId] && (
                  <span className="text-sm bg-[#2a2a3d] px-3 py-1.5 rounded-lg">
                    {NETWORKS[chainId].name}
                  </span>
                )}
                {account ? (
                  <div className="flex gap-2">
                    <span className="flex items-center gap-2 bg-indigo-600 px-4 py-2 rounded-lg text-sm font-semibold">
                      <Wallet className="w-4 h-4" /> {`${account.slice(0, 6)}...${account.slice(-4)}`}
                    </span>
                    <button
                      onClick={disconnectWallet}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectWallet}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    <Wallet className="w-4 h-4" /> Connect Wallet
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-400 mt-2">Bulk token distribution made easy – now with multichain and native token support.</p>
            
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(NETWORKS).map(([id, network]) => (
                <button
                  key={id}
                  onClick={() => switchNetwork(Number(id))}
                  className={`text-xs px-3 py-1 rounded-md transition ${
                    chainId === Number(id)
                      ? "bg-blue-600 text-white"
                      : "bg-[#2a2a3d] text-gray-300 hover:bg-[#3a3a4d]"
                  }`}
                >
                  {network.name}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300">Wallets & Amounts</label>
              <textarea
                className="w-full h-48 p-4 text-sm rounded-lg bg-[#2a2a3d] text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="0xabc123...,0.1&#13;&#10;0xdef456...,0.25"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold mb-2 text-gray-300">
                  Token Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={!isNativeToken}
                      onChange={() => setIsNativeToken(false)}
                      className="mr-2"
                    />
                    ERC20 Token
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={isNativeToken}
                      onChange={() => setIsNativeToken(true)}
                      className="mr-2"
                    />
                    Native Token
                  </label>
                </div>
              </div>
            </div>

            {!isNativeToken && (
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-300">Token Address <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="Enter token contract address"
                  className="w-full p-3 text-sm rounded-md bg-[#2a2a3d] text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-4 items-center">
              <button
                onClick={handleSend}
                disabled={isPending}
                className={`flex items-center gap-2 ${
                  isPending
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                } px-6 py-2.5 rounded-lg text-sm font-semibold transition`}
              >
                {isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" /> Send
                  </>
                )}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-2.5 rounded-lg text-sm font-semibold transition"
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
      </div>
    </>
  );
}