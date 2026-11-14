package com.philomath.api.store;

import com.philomath.api.dto.Customer;
import com.philomath.api.dto.CustomerPage;
import com.philomath.api.dto.CustomerRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class CustomerStore {

    private final CustomerRepository customers;

    public CustomerStore(CustomerRepository customers) {
        this.customers = customers;
    }

    @Transactional
    public Customer create(CustomerRequest request) {
        return customers.save(CustomerEntity.from(request)).toRecord();
    }

    @Transactional(readOnly = true)
    public CustomerPage findAll(int page, int size) {
        Page<Customer> result = customers.findAll(PageRequest.of(page, size, Sort.by("id"))).map(CustomerEntity::toRecord);
        return new CustomerPage(result.getContent(), result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public Optional<Customer> findById(long id) {
        return customers.findById(id).map(CustomerEntity::toRecord);
    }

    @Transactional
    public Optional<Customer> update(long id, CustomerRequest request) {
        return customers.findById(id).map(entity -> {
            entity.apply(request);
            return customers.save(entity).toRecord();
        });
    }

    @Transactional
    public boolean delete(long id) {
        if (!customers.existsById(id)) {
            return false;
        }
        customers.deleteById(id);
        return true;
    }

    @Transactional
    public void clear() {
        customers.deleteAllInBatch();
    }
}
