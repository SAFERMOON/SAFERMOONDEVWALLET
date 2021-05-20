// SPDX-License-Identifier: MIT

pragma solidity >= 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract Vault is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 private constant _timelock = 1 days;

    uint256 public _timelocks;
    mapping(uint256 => uint256) public _timestamps;
    mapping(uint256 => uint256) public _scheduledAmounts;

    event UnlockScheduled(uint256 timestamp, uint256 amount);
    event Withdrawal(uint256 amount);

    constructor(address _token) public {
        token = IERC20(_token);
        _timelocks = 0;
    }

    function balance() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function unlockedBalance() public view returns (uint256) {
        uint256 amount;

        for (uint256 i = 0; i < _timelocks; i++) {
            uint256 timestamp = _timestamps[i];

            if (timestamp <= block.timestamp) {
                amount = amount.add(_scheduledAmounts[timestamp]);
            }
        }

        return amount;
    }

    function lockedBalance() public view returns (uint256) {
        return balance().sub(unlockedBalance());
    }

    function unlock(uint256 amount) external onlyOwner {
        require(amount > 0, "Vault: amount must be > 0");
        require(amount <= lockedBalance(), "Vault: amount exceeds locked balance");

        uint256 timestamp = block.timestamp + _timelock;

        _timestamps[_timelocks] = timestamp;
        _scheduledAmounts[timestamp] = amount;
        _timelocks++;

        emit UnlockScheduled(timestamp, amount);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(amount > 0, "Vault: amount must be > 0");
        require(amount <= unlockedBalance(), "Vault: amount exceeds unlocked balance");

        updateTimelocks(amount);

        token.safeTransfer(owner(), amount);

        emit Withdrawal(amount);
    }

    function updateTimelocks(uint256 amount) private {
        uint256 amountWithdrawn = amount;

        for (uint256 i = 0; i < _timelocks; i++) {
            uint256 timestamp = _timestamps[i];
            uint256 amountAtTimestamp = _scheduledAmounts[timestamp];

            if (amountWithdrawn < amountAtTimestamp) {
                _scheduledAmounts[timestamp] = amountAtTimestamp.sub(amountWithdrawn);
                break;
            }

            delete _scheduledAmounts[timestamp];
            delete _timestamps[i];

            if (amountWithdrawn == amountAtTimestamp) {
                break;
            }

            // amountWithdrawn > amountAtTimestamp
            amountWithdrawn = amountWithdrawn.sub(amountAtTimestamp);
        }

        if (_timestamps[0] > 0) {
            return;
        }

        uint256 timelocks = 0;

        for (uint256 i = 0; i < _timelocks; i++) {
            uint256 timestamp = _timestamps[i];

            if (timestamp == 0) {
                continue;
            }

            delete _timestamps[i];
            _timestamps[timelocks] = timestamp;
            timelocks++;
        }

        _timelocks = timelocks;
    }
}
