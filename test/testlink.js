// const {
//   expect,
//   assert
// } = require("chai");
// const web3 = require('web3');
// const h = require("./helpers/helpers");
// const QUERYID1 = h.uintTob32(1)

// describe("testlink", function() {

//   let polyGov, flex, accounts, token;

//   beforeEach(async function() {
//     accounts = await ethers.getSigners();
//     const Token = await ethers.getContractFactory("StakingToken");
//     token = await Token.deploy();
//     await token.deployed();
//     const PolygonGovernance = await ethers.getContractFactory("Governance");
//     const TellorFlex = await ethers.getContractFactory("https://github.com/tellor-io/tellorFlex/blob/360/contracts/TellorFlex.sol")
//     flex = await TellorFlex.deploy(token.address, accounts[0].address, web3.utils.toWei("10"), 86400 / 2)
//     await flex.deployed();
//     polyGov = await PolygonGovernance.deploy(flex.address, web3.utils.toWei("10"), accounts[0].address);
//     await polyGov.deployed();
//     await flex.changeGovernanceAddress(polyGov.address);
//     await token.mint(accounts[1].address, web3.utils.toWei("1000"));
//   });
//   it("Test Constructor()", async function() {
//     assert(await polyGov.tellor() == flex.address, "tellor address should be correct")
//     assert(await polyGov.disputeFee() == web3.utils.toWei("10"), "min dispute fee should be set properly")
//     assert(await polyGov.teamMultisig() == accounts[0].address, "team multisig should be set correctly")
//   });
// });