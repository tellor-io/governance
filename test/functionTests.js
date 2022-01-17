const { expect, assert } = require("chai");
const web3 = require('web3');
const h = require("./helpers/helpers");
const precision = BigInt(1e18);
const REQUEST_ID_0 = ethers.utils.formatBytes32String("0");
const REQUEST_ID_1 = ethers.utils.formatBytes32String("1");
const FAUCET_AMOUNT = BigInt(1000) * precision;
const TOKEN_NAME = "Testing_TRB";
const TOKEN_SYMBOL = "tTRB";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUERYID1 = h.uintTob32(1)

describe("Polygon Governance Function Tests", function() {

	let polyGov,flex,accounts,token;

	beforeEach(async function () {
        accounts = await ethers.getSigners();
        const Token = await ethers.getContractFactory("StakingToken");
        token = await Token.deploy();
        await token.deployed();
		const PolygonGovernance = await ethers.getContractFactory("Governance");
        const TellorFlex = await ethers.getContractFactory("TellorFlex")
        flex = await TellorFlex.deploy(token.address,accounts[0].address,web3.utils.toWei("10"),86400/2)
        await flex.deployed();
        polyGov= await PolygonGovernance.deploy(flex.address,web3.utils.toWei("10"),accounts[0].address);
		await polyGov.deployed();
        await flex.changeGovernanceAddress(polyGov.address);
        await token.mint(accounts[1].address, web3.utils.toWei("1000"));
	});
	it("Test Constructor()", async function() {
		assert(await polyGov.tellor()== flex.address, "tellor address should be correct")
        assert(await polyGov.disputeFee() == web3.utils.toWei("10"), "min dispute fee should be set properly")
        assert(await polyGov.teamMultisig() == accounts[0].address, "team multisig should be set correctly")
	});
	it("Test beginDispute()", async function() {
        await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("1000"))
		await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
        await token.connect(accounts[1]).transfer(accounts[2].address,web3.utils.toWei("100"))
        await token.connect(accounts[1]).transfer(accounts[3].address,web3.utils.toWei("100"))
        let blocky = await h.getBlock()
        await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
        let balance1 = await token.balanceOf(accounts[2].address)
        await h.expectThrow(polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp))//no value exists
		await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
		blocky = await h.getBlock()
		await h.expectThrow(polyGov.connect(accounts[4]).beginDispute(QUERYID1, blocky.timestamp)) // must have tokens to 
        await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
		await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp);
        let balance2 = await token.balanceOf(accounts[2].address)
        let vars = await polyGov.getDisputeInfo(1)
        let _hash = ethers.utils.solidityKeccak256(['bytes32','uint256'], [h.uintTob32(1),blocky.timestamp])
		assert(vars[0] == QUERYID1, "queryID should be correct")
        assert(vars[1] == blocky.timestamp, "timestamp should be correct")
        assert(vars[2] == h.bytes(100), "value should be correct")
        assert(vars[3] == accounts[1].address, "accounts[1] should be correct")
        assert(await polyGov.getOpenDisputesOnId(QUERYID1) == 1, "open disputes on ID should be correct")
        assert(await polyGov.getVoteRounds(_hash) == 1, "number of vote rounds should be correct")
        assert(balance1 - balance2 -web3.utils.toWei("10") == 0, "dispute fee paid should be correct")
        await h.advanceTime(86400*2);
        await polyGov.tallyVotes(1)
        await h.advanceTime(86400*2);
        await polyGov.executeVote(1)
        await h.advanceTime(86400*2)
        await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
        await h.expectThrow(polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp))//assert second dispute started within a day
        await token.connect(accounts[3]).approve(flex.address, web3.utils.toWei("1000"))
		await flex.connect(accounts[3]).depositStake(web3.utils.toWei("10"))
        await flex.connect(accounts[3]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
        blocky = await h.getBlock()
        await h.advanceTime(86400+10)
        await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
        await h.expectThrow(polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp))//fast forward assert 
	});
    // it("Test executeVote()", async function() {
	// 	assert(0==1)
	// });
    // it("Test proposeChangeGovernanceAddress()", async function() {
	// 	assert(0==1)
	// });
    // it("Test proposeChangeReportingLock()", async function() {
	// 	assert(0==1)
	// });
    // it("Test proposeChangeStakeAmount()", async function() {
	// 	assert(0==1)
	// });
    // it("Test proposeUpdateUserList()", async function() {
	// 	assert(0==1)
	// });
    // it("Test tallyVotes()", async function() {
	// 	assert(0==1)
	// });
    // it("Test vote()", async function() {
	// 	assert(0==1)
	// });
    // it("Test didVote()", async function() {
	// 	assert(0==1)
	// });
    // it("Test getDisputeInfo()", async function() {
	// 	assert(0==1)
	// });
    // it("Test getOpenDisputesOnId()", async function() {
	// 	assert(0==1)
	// });
    // it("Test getVoteCount()", async function() {
	// 	assert(0==1)
	// });
    // it("Test getVoteInfo()", async function() {
	// 	assert(0==1)
	// });
    // it("Test getVoteRounds()", async function() {
	// 	assert(0==1)
	// });
    // it("Test _proposeVote()", async function() {
	// 	assert(0==1)
	// });
    // it("Test _updateUserList()", async function() {
	// 	assert(0==1)
	// });
});
