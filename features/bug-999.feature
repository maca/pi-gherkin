Feature: Bug 999 — wrong confirmation text

  Scenario: order confirmation shows the wrong message
    Given the user "Macario" is logged in
    When I fill the "Item" field with "Wonder Widget"
    And I click "Submit Order"
    Actual:
      Then I should see the message "Honky dory!"
    Expected:
      Then I should see the message "All good!"
