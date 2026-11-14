package com.philomath.api.web;

public class CustomerNotFoundException extends RuntimeException {

    private final long id;

    public CustomerNotFoundException(long id) {
        super("Customer " + id + " was not found");
        this.id = id;
    }

    public long id() {
        return id;
    }
}
