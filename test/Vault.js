const { expect } = require("chai");

const increaseTime = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
};

describe("Vault", () => {
  let Token;
  let token;

  let Vault;
  let vault;

  let owner;
  let address;

  let Timelock;
  let timelock;

  beforeEach(async () => {
    Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Token", "TOKEN", 1000000);

    Vault = await ethers.getContractFactory("Vault");
    vault = await Vault.deploy(token.address);

    [owner, address] = await ethers.getSigners();

    Timelock = await ethers.getContractFactory("Timelock");
    timelock = await Timelock.deploy(owner.address, 86400);

    await vault.transferOwnership(timelock.address);
  });

  describe("owner", () => {
    it("returns the timelock's address", async () => {
      expect(await vault.owner()).to.equal(timelock.address);
    });
  });

  describe("token", () => {
    it("returns the token's address", async () => {
      expect(await vault.token()).to.equal(token.address);
    });
  });

  describe("balance", () => {
    it("returns the vault's balance", async () => {
      expect(await vault.balance()).to.eq(0);

      await token.transfer(vault.address, 1000000);

      expect(await vault.balance()).to.eq(1000000);
    });
  });

  describe("withdraw", () => {
    it("can only be called by the timelock", async () => {
      await expect(vault.withdraw(owner.address, 1000000)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("bounds the amount", async () => {
      await token.transfer(vault.address, 1000000);

      let { timestamp } = await ethers.provider.getBlock();
      let data = ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [owner.address, 0]);
      await timelock.queueTransaction(vault.address, 0, "withdraw(address,uint256)", data, timestamp + 86400 + 1);
      await increaseTime(86400)
      await expect(timelock.executeTransaction(vault.address, 0, "withdraw(address,uint256)", data, timestamp + 86400 + 1)).to.be.reverted;

      timestamp = (await ethers.provider.getBlock()).timestamp;
      data = ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [owner.address, 10000000]);
      await timelock.queueTransaction(vault.address, 0, "withdraw(address,uint256)", data, timestamp + 86400 + 1);
      await increaseTime(86400)
      await expect(timelock.executeTransaction(vault.address, 0, "withdraw(address,uint256)", data, timestamp + 86400 + 1)).to.be.reverted;
    });

    it("transfers the amount to the recipient", async () => {
      await token.transfer(vault.address, 1000000);

      let { timestamp } = await ethers.provider.getBlock();
      let data = ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [owner.address, 500000]);
      await timelock.queueTransaction(vault.address, 0, "withdraw(address,uint256)", data, timestamp + 86400 + 1);
      await increaseTime(86400)
      await expect(timelock.executeTransaction(vault.address, 0, "withdraw(address,uint256)", data, timestamp + 86400 + 1)).to.emit(vault, "Withdrawal").withArgs(500000);

      expect(await vault.balance()).to.equal(500000);
      expect(await token.balanceOf(owner.address)).to.equal(500000);

      timestamp = (await ethers.provider.getBlock()).timestamp;
      data = ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [address.address, 500000]);
      await timelock.queueTransaction(vault.address, 0, "withdraw(address,uint256)", data, timestamp + 86400 + 1);
      await increaseTime(86400)
      await expect(timelock.executeTransaction(vault.address, 0, "withdraw(address,uint256)", data, timestamp + 86400 + 1)).to.emit(vault, "Withdrawal").withArgs(500000);

      expect(await vault.balance()).to.equal(0);
      expect(await token.balanceOf(address.address)).to.equal(500000);
    });
  });
});
