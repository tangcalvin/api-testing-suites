package com.philomath.api.store;

import com.philomath.api.dto.Customer;
import com.philomath.api.dto.CustomerCompany;
import com.philomath.api.dto.CustomerProfile;
import com.philomath.api.dto.CustomerRequest;
import com.philomath.api.dto.CustomerStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "customer")
public class CustomerEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String customerCode;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, length = 120)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CustomerStatus status;

    @Column(nullable = false, length = 80)
    private String displayName;

    @Column(nullable = false, length = 10)
    private String locale;

    @Column(nullable = false, length = 120)
    private String companyName;

    @Column(nullable = false, length = 40)
    private String registrationNo;

    public static CustomerEntity from(CustomerRequest request) {
        CustomerEntity entity = new CustomerEntity();
        entity.apply(request);
        return entity;
    }

    public void apply(CustomerRequest request) {
        customerCode = Text.trim(request.customerCode());
        name = Text.trim(request.name());
        email = Text.trim(request.email());
        status = request.status();
        CustomerProfile profile = request.profile();
        displayName = profile == null ? null : Text.trim(profile.displayName());
        locale = profile == null ? null : Text.trim(profile.locale());
        CustomerCompany company = profile == null ? null : profile.company();
        companyName = company == null ? null : Text.trim(company.name());
        registrationNo = company == null ? null : Text.trim(company.registrationNo());
    }

    public Customer toRecord() {
        CustomerCompany company = companyName == null && registrationNo == null
                ? null
                : new CustomerCompany(companyName, registrationNo);
        CustomerProfile profile = displayName == null && locale == null && company == null
                ? null
                : new CustomerProfile(displayName, locale, company);
        return new Customer(id, customerCode, name, email, status, profile);
    }

    public Long getId() {
        return id;
    }
}
