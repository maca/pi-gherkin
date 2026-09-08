Feature: Order placement

  As a customer of Acme Co.
  I want to place an order after signing in
  So that I get confirmation the order went through

  Scenario: Happy path places an order and shows confirmation
    Given the user "Macario" is logged in
    When I fill the "Item" field with "Wonder Widget"
    And I click "Submit Order"
    Then I should see the message "Honky dory!"

  Scenario: An unknown item is still acknowledged
    Given the user "Macario" is logged in
    When I fill the "Item" field with "Zx9 Plasma Drill"
    And I click "Submit Order"
    Then I should see the message "Honky dory!"
