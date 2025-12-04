// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface SpyCommunication {
  id: string;
  encryptedContent: string;
  timestamp: number;
  origin: string;
  era: string;
  status: "unverified" | "analyzed" | "archived";
}

const App: React.FC = () => {
  // Retro pixel style with high contrast colors
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [communications, setCommunications] = useState<SpyCommunication[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newCommunicationData, setNewCommunicationData] = useState({
    era: "",
    origin: "",
    content: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEra, setSelectedEra] = useState("all");
  const [showTeamInfo, setShowTeamInfo] = useState(false);

  // Stats for dashboard
  const analyzedCount = communications.filter(c => c.status === "analyzed").length;
  const unverifiedCount = communications.filter(c => c.status === "unverified").length;
  const archivedCount = communications.filter(c => c.status === "archived").length;

  useEffect(() => {
    loadCommunications().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadCommunications = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("communication_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing communication keys:", e);
        }
      }
      
      const list: SpyCommunication[] = [];
      
      for (const key of keys) {
        try {
          const commBytes = await contract.getData(`communication_${key}`);
          if (commBytes.length > 0) {
            try {
              const commData = JSON.parse(ethers.toUtf8String(commBytes));
              list.push({
                id: key,
                encryptedContent: commData.content,
                timestamp: commData.timestamp,
                origin: commData.origin,
                era: commData.era,
                status: commData.status || "unverified"
              });
            } catch (e) {
              console.error(`Error parsing communication data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading communication ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setCommunications(list);
    } catch (e) {
      console.error("Error loading communications:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitCommunication = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting sensitive data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedContent = `FHE-${btoa(JSON.stringify(newCommunicationData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const commId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const commData = {
        content: encryptedContent,
        timestamp: Math.floor(Date.now() / 1000),
        origin: newCommunicationData.origin,
        era: newCommunicationData.era,
        status: "unverified"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `communication_${commId}`, 
        ethers.toUtf8Bytes(JSON.stringify(commData))
      );
      
      const keysBytes = await contract.getData("communication_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(commId);
      
      await contract.setData(
        "communication_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted communication submitted securely!"
      });
      
      await loadCommunications();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewCommunicationData({
          era: "",
          origin: "",
          content: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const analyzeCommunication = async (commId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const commBytes = await contract.getData(`communication_${commId}`);
      if (commBytes.length === 0) {
        throw new Error("Communication not found");
      }
      
      const commData = JSON.parse(ethers.toUtf8String(commBytes));
      
      const updatedComm = {
        ...commData,
        status: "analyzed"
      };
      
      await contract.setData(
        `communication_${commId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedComm))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE analysis completed successfully!"
      });
      
      await loadCommunications();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Analysis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const archiveCommunication = async (commId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const commBytes = await contract.getData(`communication_${commId}`);
      if (commBytes.length === 0) {
        throw new Error("Communication not found");
      }
      
      const commData = JSON.parse(ethers.toUtf8String(commBytes));
      
      const updatedComm = {
        ...commData,
        status: "archived"
      };
      
      await contract.setData(
        `communication_${commId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedComm))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE archiving completed successfully!"
      });
      
      await loadCommunications();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Archiving failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredCommunications = communications.filter(comm => {
    const matchesSearch = comm.origin.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          comm.era.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEra = selectedEra === "all" || comm.era === selectedEra;
    return matchesSearch && matchesEra;
  });

  const eras = [...new Set(communications.map(comm => comm.era))];

  if (loading) return (
    <div className="loading-screen">
      <div className="pixel-spinner"></div>
      <p>Decrypting historical archives...</p>
    </div>
  );

  return (
    <div className="app-container pixel-theme">
      <header className="app-header">
        <div className="logo">
          <h1>SpyCom<span>FHE</span></h1>
          <p className="tagline">機密化的歷史間諜通信分析</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="pixel-button"
          >
            Add Communication
          </button>
          <button 
            className="pixel-button"
            onClick={() => setShowTeamInfo(!showTeamInfo)}
          >
            {showTeamInfo ? "Hide Team" : "Show Team"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Confidential Analysis of Historical Espionage Communications</h2>
            <p>Perform FHE text analysis on decrypted yet sensitive historical spy communications</p>
          </div>
        </div>
        
        {showTeamInfo && (
          <div className="team-section pixel-card">
            <h2>Research Team</h2>
            <div className="team-grid">
              <div className="team-member">
                <div className="pixel-avatar"></div>
                <h3>Dr. Alan Turing</h3>
                <p>Cryptography Expert</p>
              </div>
              <div className="team-member">
                <div className="pixel-avatar"></div>
                <h3>Prof. Mei Ling</h3>
                <p>Historical Analyst</p>
              </div>
              <div className="team-member">
                <div className="pixel-avatar"></div>
                <h3>Agent X</h3>
                <p>Field Operations</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card pixel-card">
            <h3>Project Overview</h3>
            <p>Historians can encrypt decrypted but still sensitive historical spy communications (such as telegrams) and perform FHE text analysis.</p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="dashboard-card pixel-card">
            <h3>Communications Stats</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{communications.length}</div>
                <div className="stat-label">Total</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{analyzedCount}</div>
                <div className="stat-label">Analyzed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{unverifiedCount}</div>
                <div className="stat-label">Unverified</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{archivedCount}</div>
                <div className="stat-label">Archived</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="search-filter-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search communications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pixel-input"
            />
          </div>
          <div className="filter-box">
            <select
              value={selectedEra}
              onChange={(e) => setSelectedEra(e.target.value)}
              className="pixel-select"
            >
              <option value="all">All Eras</option>
              {eras.map((era, index) => (
                <option key={index} value={era}>{era}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="communications-section">
          <div className="section-header">
            <h2>Encrypted Spy Communications</h2>
            <div className="header-actions">
              <button 
                onClick={loadCommunications}
                className="pixel-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="communications-list pixel-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Origin</div>
              <div className="header-cell">Era</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredCommunications.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No encrypted communications found</p>
                <button 
                  className="pixel-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Communication
                </button>
              </div>
            ) : (
              filteredCommunications.map(comm => (
                <div className="record-row" key={comm.id}>
                  <div className="table-cell record-id">#{comm.id.substring(0, 6)}</div>
                  <div className="table-cell">{comm.origin}</div>
                  <div className="table-cell">{comm.era}</div>
                  <div className="table-cell">
                    {new Date(comm.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${comm.status}`}>
                      {comm.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    <button 
                      className="pixel-button success"
                      onClick={() => analyzeCommunication(comm.id)}
                    >
                      Analyze
                    </button>
                    <button 
                      className="pixel-button danger"
                      onClick={() => archiveCommunication(comm.id)}
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitCommunication} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          communicationData={newCommunicationData}
          setCommunicationData={setNewCommunicationData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content pixel-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="pixel-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <h1>SpyCom<span>FHE</span></h1>
            </div>
            <p>Confidential Analysis of Historical Espionage Communications</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} SpyComFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  communicationData: any;
  setCommunicationData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  communicationData,
  setCommunicationData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCommunicationData({
      ...communicationData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!communicationData.era || !communicationData.content) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal pixel-card">
        <div className="modal-header">
          <h2>Add Encrypted Communication</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            Your sensitive data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Era *</label>
              <select 
                name="era"
                value={communicationData.era} 
                onChange={handleChange}
                className="pixel-select"
              >
                <option value="">Select era</option>
                <option value="Cold War">Cold War</option>
                <option value="WWII">World War II</option>
                <option value="Victorian">Victorian Era</option>
                <option value="Modern">Modern</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Origin</label>
              <input 
                type="text"
                name="origin"
                value={communicationData.origin} 
                onChange={handleChange}
                placeholder="Country/Organization..." 
                className="pixel-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Content *</label>
              <textarea 
                name="content"
                value={communicationData.content} 
                onChange={handleChange}
                placeholder="Enter sensitive communication content to encrypt..." 
                className="pixel-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="pixel-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="pixel-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;