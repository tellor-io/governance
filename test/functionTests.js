const { expect, assert } = require("chai");
const web3 = require('web3');

const precision = BigInt(1e18);
const REQUEST_ID_0 = ethers.utils.formatBytes32String("0");
const REQUEST_ID_1 = ethers.utils.formatBytes32String("1");
const FAUCET_AMOUNT = BigInt(1000) * precision;
const TOKEN_NAME = "Testing_TRB";
const TOKEN_SYMBOL = "tTRB";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Polygon Governance Function Tests", function() {

	let polyGov,flex,accounts,token;

	beforeEach(async function () {
        accounts = await ethers.getSigners();
        const Token = await ethers.getContractFactory("StakingToken");
        token = await Token.deploy();
        await token.deployed();
		const PolygonGovernance = await ethers.getContractFactory("Governance");
        const TellorFlex = await ethers.getContractFactory("TellorFlex")
        flex = await TellorFlex.deploy(token.address,accounts[0].address,web3.utils.toWei("10"),86400*12)
        await flex.deployed();
        polyGov= await PolygonGovernance.deploy(flex.address,precision,accounts[0].address);
		await polyGov.deployed();
        await flex.changeGovernanceAddress(polyGov.address);
	});
	it("Test Constructor()", async function() {
		assert(0==1)
	});

	it("Test beginDispute()", async function() {
		assert(0==1)
	});
    it("Test executeVote()", async function() {
		assert(0==1)
	});
    it("Test proposeChangeGovernanceAddress()", async function() {
		assert(0==1)
	});
    it("Test proposeChangeReportingLock()", async function() {
		assert(0==1)
	});
    it("Test proposeChangeStakeAmount()", async function() {
		assert(0==1)
	});
    it("Test proposeUpdateUserList()", async function() {
		assert(0==1)
	});
    it("Test tallyVotes()", async function() {
		assert(0==1)
	});
    it("Test updateMinDisputeFee()", async function() {
		assert(0==1)
	});
    it("Test vote()", async function() {
		assert(0==1)
	});
    it("Test didVote()", async function() {
		assert(0==1)
	});
    it("Test getDisputeInfo()", async function() {
		assert(0==1)
	});
    it("Test getOpenDisputesOnId()", async function() {
		assert(0==1)
	});
    it("Test getVoteCount()", async function() {
		assert(0==1)
	});
    it("Test getVoteInfo()", async function() {
		assert(0==1)
	});
    it("Test getVoteRounds()", async function() {
		assert(0==1)
	});
    it("Test _proposeVote()", async function() {
		assert(0==1)
	});
    it("Test _updateUserList()", async function() {
		assert(0==1)
	});
});
