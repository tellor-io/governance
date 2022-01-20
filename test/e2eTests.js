// const { expect, assert } = require("chai");
// const web3 = require('web3');

// const precision = BigInt(1e18);
// const REQUEST_ID_0 = ethers.utils.formatBytes32String("0");
// const REQUEST_ID_1 = ethers.utils.formatBytes32String("1");
// const FAUCET_AMOUNT = BigInt(1000) * precision;
// const TOKEN_NAME = "Testing_TRB";
// const TOKEN_SYMBOL = "tTRB";
// const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// describe("Polygon Governance Function Tests", function() {

// 	let polyGov,flex,accounts,token;

// 	beforeEach(async function () {
//         accounts = await ethers.getSigners();
//         const Token = await ethers.getContractFactory("StakingToken");
//         token = await Token.deploy();
//         await token.deployed();
// 		const PolygonGovernance = await ethers.getContractFactory("Governance");
//         const TellorFlex = await ethers.getContractFactory("TellorFlex")
//         flex = await TellorFlex.deploy(token.address,accounts[0].address,web3.utils.toWei("10"),86400*12)
//         await flex.deployed();
//         polyGov= await PolygonGovernance.deploy(flex.address,precision,accounts[0].address);
// 		await polyGov.deployed();
//         await flex.changeGovernanceAddress(polyGov.address);
// 	});
// 	it("Test multiple disputes", async function() {
// 		assert(0==1)
// 	});

// 	it("Test multiple disputes, changing stake amount mid dispute", async function() {
// 		assert(0==1)
// 	});
//     it("Test multiple disputes, changing governance address mid dispute", async function() {
// 		assert(0==1)
// 	});
//     it("Test multiple disputes, change time lock mid dispute", async function() {
// 		assert(0==1)
// 	});    
//     it("Test no votes on a dispute", async function() {
// 		assert(0==1)
// 	});    
//     it("Test multiple vote rounds on a dispute, all passing", async function() {
// 		assert(0==1)
// 	});    
//     it("Test multiple vote rounds on a dispute,  overturn result", async function() {
// 		assert(0==1)
// 	});

// })
