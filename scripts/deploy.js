require("hardhat-gas-reporter");
require('hardhat-contract-sizer');
require("solidity-coverage");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("dotenv").config();
const web3 = require('web3');

//const dotenv = require('dotenv').config()
//npx hardhat run scripts/deploy.js --network rinkeby

//Polygon or mumbai??
//var tellorAddress = '0x41b66dd93b03e89D29114a7613A6f9f0d4F40178'
//var teamMultisigAddress = '0x80fc34a2f9FfE86F41580F47368289C402DEc660'

//Arbitrum testnet
//var tellorAddress = '0xb32e05DF1f11B1f0E1DE2A35F4D99393EB86FF8B'
//var teamMultisigAddress = '0x73B6715D9289bdfE5e758bB7ace782Cc7C933cfC'

//Harmony mainnet
 var tellorAddress = '0xb32e05DF1f11B1f0E1DE2A35F4D99393EB86FF8B'
 var teamMultisigAddress = '0x73B6715D9289bdfE5e758bB7ace782Cc7C933cfC'

var dispute_fee = web3.utils.toWei("10")

async function deployPolygonGovernance(_network, _pk, _nodeURL, tellorAdd, disputeFee, teamMultisigAdd) {
    console.log("deploy polygonGovernance")
    await run("compile")

    var net = _network

    ///////////////Connect to the network
    let privateKey = _pk;
    var provider = new ethers.providers.JsonRpcProvider(_nodeURL)
    let wallet = new ethers.Wallet(privateKey, provider)

    /////////// Deploy Polygon governance
    console.log("deploy polygon governance")

    /////////////PolygonGovernance
    console.log("Starting deployment for PolygonGovernance contract...")
    const Governance = await ethers.getContractFactory("contracts/Governance.sol:Governance", wallet)
    const governancewithsigner = await Governance.connect(wallet)
    const governance = await governancewithsigner.deploy(tellorAdd, disputeFee, teamMultisigAdd)
    await governance.deployed();

    if (net == "mainnet"){
        console.log("Governance contract deployed to:", "https://etherscan.io/address/" + governance.address);
        console.log("    transaction hash:", "https://etherscan.io/tx/" + governance.deployTransaction.hash);
    } else if (net == "rinkeby") {
        console.log("Governance contract deployed to:", "https://rinkeby.etherscan.io/address/" + governance.address);
        console.log("    transaction hash:", "https://rinkeby.etherscan.io/tx/" + governance.deployTransaction.hash);
    } else if (net == "bsc_testnet") {
        console.log("Governance contract deployed to:", "https://testnet.bscscan.com/address/" + governance.address);
        console.log("    transaction hash:", "https://testnet.bscscan.com/tx/" + governance.deployTransaction.hash);
    } else if (net == "bsc") {
        console.log("Governance contract deployed to:", "https://bscscan.com/address/" + governance.address);
        console.log("    transaction hash:", "https://bscscan.com/tx/" + governance.deployTransaction.hash);
    } else if (net == "polygon") {
        console.log("Governance contract deployed to:", "https://polygonscan.com/address/" + governance.address);
        console.log("    transaction hash:", "https://polygonscan.com/tx/" + governance.deployTransaction.hash);
    } else if (net == "polygon_testnet") {
        console.log("Governance contract deployed to:", "https://mumbai.polygonscan.com/address/" + governance.address);
        console.log("    transaction hash:", "https://mumbai.polygonscan.com/tx/" + governance.deployTransaction.hash);
    } else if (net == "arbitrum_testnet"){
        console.log("Governance contract deployed to:","https://rinkeby-explorer.arbitrum.io/#/"+ governance.address)
        console.log("    transaction hash:", "https://rinkeby-explorer.arbitrum.io/#/tx/" + governance.deployTransaction.hash);
    }  else if (net == "xdaiSokol"){ //https://blockscout.com/poa/xdai/address/
      console.log("Governance contract deployed to:","https://blockscout.com/poa/sokol/address/"+ governance.address)
      console.log("    transaction hash:", "https://blockscout.com/poa/sokol/tx/" + governance.deployTransaction.hash);
    } else if (net == "xdai"){ //https://blockscout.com/poa/xdai/address/
      console.log("Governance contract deployed to:","https://blockscout.com/xdai/mainnet/address/"+ governance.address)
      console.log("    transaction hash:", "https://blockscout.com/xdai/mainnet/tx/" + governance.deployTransaction.hash);
    } else {
        console.log("Please add network explorer details")
    }


    // Wait for few confirmed transactions.
    // Otherwise the etherscan api doesn't find the deployed contract.
    console.log('waiting for TellorFlex tx confirmation...');
    await governance.deployTransaction.wait(7)

    console.log('submitting TellorFlex contract for verification...');

    await run("verify:verify",
        {
            address: governance.address,
            constructorArguments: [tellorAdd, disputeFee, teamMultisigAdd]
        },
    )

    console.log("Polygon governance contract verified")

}

//deployPolygonGovernance("arbitrum_testnet", process.env.PRIVATE_KEY, process.env.NODE_URL_ARBITRUM_TESTNET, tellorAddress, dispute_fee, teamMultisigAddress)
deployPolygonGovernance("harmony_mainnet", process.env.PRIVATE_KEY, process.env.NODE_URL_HARMONY_MAINNET, tellorAddress, dispute_fee, teamMultisigAddress)
//deployPolygonGovernance("polygon_testnet", process.env.TESTNET_PK, process.env.NODE_URL_MUMBAI, tellorAddress, dispute_fee, teamMultisigAddress)
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });



