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

  beforeEach(async () => {
    Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Token", "TOKEN", 1000000);

    Vault = await ethers.getContractFactory("Vault");
    vault = await Vault.deploy(token.address);

    [owner, address] = await ethers.getSigners();
  });

  describe("owner", () => {
    it("returns the owner's address", async () => {
      expect(await vault.owner()).to.equal(owner.address);
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

  describe("unlockedBalance", () => {
    it("returns the unlocked balance", async () => {
      await token.transfer(vault.address, 1000000);

      await vault.unlock(100000);

      await increaseTime(86400);

      expect(await vault.unlockedBalance()).to.equal(100000);
    });
  });

  describe("lockedBalance", () => {
    it("returns the locked balance", async () => {
      await token.transfer(vault.address, 1000000);

      await vault.unlock(100000);

      await increaseTime(86400);

      expect(await vault.lockedBalance()).to.equal(900000);
    });
  });

  describe("unlock", () => {
    it("can only be called by the owner", async () => {
      await expect(vault.connect(address).unlock(1000000)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("bounds the amount", async () => {
      await token.transfer(vault.address, 1000000);

      await expect(vault.unlock(0)).to.be.revertedWith("Vault: amount must be > 0");

      await vault.unlock(500000);
      await increaseTime(86400);

      await expect(vault.unlock(1000000)).to.be.revertedWith("Vault: amount exceeds locked balance");
    });

    it("schedules the amount to be unlocked", async () => {
      await token.transfer(vault.address, 1000000);

      let transaction;
      const timestamp = await new Promise((resolve, reject) => {
        transaction = vault.unlock(500000);

        transaction.then(
          async ({ blockNumber }) => {
            const block = await ethers.provider.getBlock(blockNumber);
            resolve(block.timestamp);
          },
          reject
        );
      });
      await expect(transaction).to.emit(vault, "UnlockScheduled").withArgs(timestamp + 86400, 500000);

      expect(await vault._timelocks()).to.equal(1);
      expect(await vault._timestamps(0)).to.equal(timestamp + 86400);
      expect(await vault._scheduledAmounts(timestamp + 86400)).to.equal(500000);
    });
  });

  describe("withdraw", () => {
    it("can only be called by the owner", async () => {
      await expect(vault.connect(address).withdraw(1000000)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("bounds the amount", async () => {
      await expect(vault.withdraw(0)).to.be.revertedWith("Vault: amount must be > 0");
      await expect(vault.withdraw(10000000)).to.be.revertedWith("Vault: amount exceeds unlocked balance");
    });

    it("transfers the amount to the owner", async () => {
      await token.transfer(vault.address, 1000000);

      await vault.unlock(500000);
      await increaseTime(86400);

      await expect(vault.withdraw(500000)).to.emit(vault, "Withdrawal").withArgs(500000);

      expect(await vault.balance()).to.equal(500000);
      expect(await token.balanceOf(owner.address)).to.equal(500000);
    });

    it("updates the scheduled amounts", async () => {
      await token.transfer(vault.address, 1000000);

      // unlock 100,000
      await vault.unlock(100000);
      const { timestamp: timestamp1 } = await ethers.provider.getBlock();

      await increaseTime(86400);
      expect(await vault.lockedBalance()).to.equal(900000);
      expect(await vault.unlockedBalance()).to.equal(100000);

      // withdraw half of it
      await vault.withdraw(50000);
      expect(await vault.balance()).to.equal(950000);

      // half should still be unlocked at the same time
      // amountWithdrawn < amountAtTimestamp
      expect(await vault.lockedBalance()).to.equal(900000);
      expect(await vault.unlockedBalance()).to.equal(50000);
      expect(await vault._timelocks()).to.equal(1);
      expect(await vault._timestamps(0)).to.equal(timestamp1 + 86400);
      expect(await vault._scheduledAmounts(timestamp1 + 86400)).to.equal(50000);

      // unlock another 100,000
      await vault.unlock(100000);
      const { timestamp: timestamp2 } = await ethers.provider.getBlock();

      await increaseTime(86400);
      expect(await vault.lockedBalance()).to.equal(800000);
      expect(await vault.unlockedBalance()).to.equal(150000);

      // withdraw the rest of the first unlock and half of the second unlock
      await vault.withdraw(100000);
      expect(await vault.balance()).to.equal(850000);

      // half of the second unlock should be left
      // amountWithdrawn > amountAtTimestamp
      expect(await vault.lockedBalance()).to.equal(800000);
      expect(await vault.unlockedBalance()).to.equal(50000);
      expect(await vault._timelocks()).to.equal(1);
      expect(await vault._timestamps(0)).to.equal(timestamp2 + 86400);
      expect(await vault._timestamps(1)).to.equal(0);
      expect(await vault._scheduledAmounts(timestamp1 + 86400)).to.equal(0);
      expect(await vault._scheduledAmounts(timestamp2 + 86400)).to.equal(50000);

      // withdraw the rest
      await vault.withdraw(50000);
      expect(await vault.balance()).to.equal(800000);

      // no unlock left
      // amountWithdrawn == amountAtTimestamp
      expect(await vault.lockedBalance()).to.equal(800000);
      expect(await vault.unlockedBalance()).to.equal(0);
      expect(await vault._timelocks()).to.equal(0);
      expect(await vault._timestamps(0)).to.equal(0);
      expect(await vault._timestamps(1)).to.equal(0);
      expect(await vault._scheduledAmounts(timestamp1 + 86400)).to.equal(0);
      expect(await vault._scheduledAmounts(timestamp2 + 86400)).to.equal(0);
    });
  });
});
