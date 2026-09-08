Feature: Bug 999 — wrong confirmation text

  Scenario: order confirmation shows the wrong message
    Given the user "Macario" is logged in
    When I fill the "Item" field with "Wonder Widget"
    And I click "Submit Order"
    Then the actual behavior is observed
    Then the expected behavior is observed
