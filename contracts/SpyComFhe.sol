// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SpyComFhe is SepoliaConfig {
    struct EncryptedDocument {
        uint256 docId;
        address submitter;
        euint32 content;
        euint32 metadata;
        uint256 timestamp;
    }

    struct AnalysisResult {
        uint256 analysisId;
        euint32 topicScore;
        euint32 networkScore;
        uint256 timestamp;
    }

    uint256 public documentCount;
    uint256 public analysisCount;
    mapping(uint256 => EncryptedDocument) public documents;
    mapping(uint256 => AnalysisResult) public analysisResults;
    mapping(address => uint256[]) public researcherDocuments;
    mapping(address => bool) public authorizedResearchers;

    event DocumentUploaded(uint256 indexed docId, address indexed submitter, uint256 timestamp);
    event AnalysisRequested(uint256 indexed analysisId);
    event AnalysisCompleted(uint256 indexed analysisId, uint256 timestamp);

    modifier onlyResearcher() {
        require(authorizedResearchers[msg.sender], "Unauthorized researcher");
        _;
    }

    constructor() {
        authorizedResearchers[msg.sender] = true;
    }

    function authorizeResearcher(address researcher) external onlyResearcher {
        authorizedResearchers[researcher] = true;
    }

    function uploadDocument(
        euint32 encryptedContent,
        euint32 encryptedMetadata
    ) external onlyResearcher {
        documentCount++;
        uint256 newId = documentCount;

        documents[newId] = EncryptedDocument({
            docId: newId,
            submitter: msg.sender,
            content: encryptedContent,
            metadata: encryptedMetadata,
            timestamp: block.timestamp
        });

        researcherDocuments[msg.sender].push(newId);
        emit DocumentUploaded(newId, msg.sender, block.timestamp);
    }

    function requestTextAnalysis() external onlyResearcher {
        analysisCount++;
        uint256 newId = analysisCount;

        bytes32[] memory ciphertexts = new bytes32[](documentCount * 2);
        uint256 index = 0;
        
        for (uint256 i = 1; i <= documentCount; i++) {
            ciphertexts[index++] = FHE.toBytes32(documents[i].content);
            ciphertexts[index++] = FHE.toBytes32(documents[i].metadata);
        }

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.performAnalysis.selector);
        emit AnalysisRequested(newId);
    }

    function performAnalysis(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external {
        FHE.checkSignatures(requestId, cleartexts, proof);

        euint32[] memory results = abi.decode(cleartexts, (euint32[]));
        
        analysisResults[requestId] = AnalysisResult({
            analysisId: requestId,
            topicScore: results[0],
            networkScore: results[1],
            timestamp: block.timestamp
        });

        emit AnalysisCompleted(requestId, block.timestamp);
    }

    function getDocumentContent(uint256 docId) external view onlyResearcher returns (euint32) {
        return documents[docId].content;
    }

    function getDocumentMetadata(uint256 docId) external view onlyResearcher returns (euint32) {
        return documents[docId].metadata;
    }

    function getAnalysisResult(uint256 analysisId) external view onlyResearcher returns (euint32, euint32) {
        AnalysisResult storage result = analysisResults[analysisId];
        return (result.topicScore, result.networkScore);
    }

    function getResearcherDocuments(address researcher) external view onlyResearcher returns (uint256[] memory) {
        return researcherDocuments[researcher];
    }
}