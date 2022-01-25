const { expect, assert } = require("chai");
const web3 = require('web3');
const h = require("./helpers/helpers");
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
        flex = await TellorFlex.deploy(token.address, accounts[0].address, web3.utils.toWei("10"), 86400 / 2)
        await flex.deployed();
        polyGov = await PolygonGovernance.deploy(flex.address, web3.utils.toWei("10"), accounts[0].address);
        await polyGov.deployed();
        await flex.changeGovernanceAddress(polyGov.address);
        await token.mint(accounts[1].address, web3.utils.toWei("1000"));
	});
	it("Test multiple disputes", async function() {
        await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("1000"))
        await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
        await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
        await token.connect(accounts[1]).transfer(accounts[3].address, web3.utils.toWei("100"))
        await token.connect(accounts[1]).transfer(accounts[4].address, web3.utils.toWei("100"))
        await token.connect(accounts[1]).transfer(accounts[5].address, web3.utils.toWei("100"))
        await token.connect(accounts[4]).approve(flex.address, web3.utils.toWei("100"))
        await flex.connect(accounts[4]).depositStake(web3.utils.toWei("10"))
        await token.connect(accounts[5]).approve(flex.address, web3.utils.toWei("100"))
        await flex.connect(accounts[5]).depositStake(web3.utils.toWei("10"))
        let blocky = await h.getBlock()
        await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
        let balance1 = await token.balanceOf(accounts[2].address)
        await h.expectThrow(polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)) //no value exists
        await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
        blocky = await h.getBlock()
        await flex.connect(accounts[4]).submitValue(h.hash('0x123456'), h.bytes(200), 0,'0x123456')
        let blocky2 = await h.getBlock()
        await flex.connect(accounts[5]).submitValue(h.hash('0x1234'), h.bytes("a"), 0, '0x1234')
        let blocky3 = await h.getBlock()
        await h.expectThrow(polyGov.connect(accounts[4]).beginDispute(QUERYID1, blocky.timestamp)) // must have tokens to
        await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("30"))
        await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp);
        await polyGov.connect(accounts[2]).beginDispute(h.hash('0x123456'), blocky2.timestamp);
        await polyGov.connect(accounts[2]).beginDispute(h.hash('0x1234'), blocky3.timestamp);
        assert(await polyGov.voteCount() == 3, "vote count should be 3")
        let balance2 = await token.balanceOf(accounts[2].address)
        let vars = await polyGov.getDisputeInfo(1)
        let _hash = ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.uintTob32(1), blocky.timestamp])
        assert(vars[0] == QUERYID1, "queryID should be correct")
        assert(vars[1] == blocky.timestamp, "timestamp should be correct")
        assert(vars[2] == h.bytes(100), "value should be correct")
        assert(vars[3] == accounts[1].address, "accounts[1] should be correct")
        assert(await polyGov.getOpenDisputesOnId(QUERYID1) == 1, "open disputes on ID should be correct")
        assert(await polyGov.getVoteRounds(_hash) == 1, "number of vote rounds should be correct")
        vars = await polyGov.getDisputeInfo(2)
        _hash = await ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.hash('0x123456'), blocky2.timestamp])
        assert(vars[0] == h.hash('0x123456'), "queryID should be correct")
        assert(vars[1] == blocky2.timestamp, "timestamp should be correct")
        assert(vars[2] == h.bytes(200), "value should be correct")
        assert(vars[3] == accounts[4].address, "accounts[1] should be correct")
        assert(await polyGov.getOpenDisputesOnId(h.hash('0x123456')) == 1, "open disputes on ID should be correct")
        let vr = await polyGov.getVoteRounds(_hash)
        assert(vr.length == 1, "number of vote rounds should be correct")
        vars = await polyGov.getDisputeInfo(3)
        _hash = ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.hash('0x1234'), blocky3.timestamp])
        assert(vars[0] == h.hash('0x1234'), "queryID should be correct")
        assert(vars[1] == blocky3.timestamp, "timestamp should be correct")
        assert(vars[2] == h.bytes("a"), "value should be correct")
        assert(vars[3] == accounts[5].address, "accounts[1] should be correct")
        assert(await polyGov.getOpenDisputesOnId(h.hash('0x1234')) == 1, "open disputes on ID should be correct")
        vr = await polyGov.getVoteRounds(_hash)
        assert(vr.length == 1, "number of vote rounds should be correct")
        await h.advanceTime(86400 * 2);
        await polyGov.tallyVotes(1)
        await polyGov.tallyVotes(2)
        await polyGov.tallyVotes(3)
        for(var i =1;i<4;i++){
            vars = await polyGov.getVoteInfo(i)
            assert(vars[2][1] == true, "Vote isDispute should be false")
            assert(vars[3] == 2, "Vote result should be INVALID")
        }
        await h.advanceTime(86400 * 2);
        await polyGov.executeVote(1)
        await polyGov.executeVote(2)
        await polyGov.executeVote(3)
	});

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

})
